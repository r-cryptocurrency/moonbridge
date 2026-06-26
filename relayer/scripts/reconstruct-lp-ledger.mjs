// Reconstruct the MOON LP ledger across all chains from onchain events.
//
// READ-ONLY. No private key, no writes. Reads historical logs and current contract state
// through the Etherscan V2 API (server-side log indexing), then produces a per-address
// ledger plus per-chain solvency figures so you can determine who is owed what.
//
// Allocation rule applied: net-deposit refund (each address credited pro-rata to its net
// deposited principal across all chains, against the total physical MOON held).
//
// Requires in relayer/.env:
//   ETHERSCAN_API_KEY=<your Etherscan V2 multichain key>
// Optional overrides:
//   BRIDGE_NOVA_ADDRESS, BRIDGE_ONE_ADDRESS, BRIDGE_ETHEREUM_ADDRESS
//   START_BLOCK_42170, START_BLOCK_42161, START_BLOCK_1   (defaults = V2 deploy blocks)
//
// Run:  node scripts/reconstruct-lp-ledger.mjs
// Out:  ./lp-ledger.json  and  ./lp-ledger.csv
//
// Note on Arbitrum Nova (chainid 42170): if the Etherscan V2 key does not cover Nova, that
// chain will report an error and the other two will still complete. Nova can then be rerun
// against nova.arbiscan.io separately.

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import {
  getAddress, keccak256, toBytes, parseAbiItem, formatEther,
  encodeFunctionData, decodeFunctionResult, decodeEventLog, toEventSelector,
} from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000';
const API = 'https://api.etherscan.io/v2/api';
const KEY = process.env.ETHERSCAN_API_KEY;

const CHAINS = [
  {
    key: 'nova', chainId: 42170,
    bridge: process.env.BRIDGE_NOVA_ADDRESS || '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c',
    moon: '0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0',
    start: Number(process.env.START_BLOCK_42170 || 84551314),
  },
  {
    key: 'one', chainId: 42161,
    bridge: process.env.BRIDGE_ONE_ADDRESS || '0x609B1430b6575590F5C75bcb7db261007d5FED41',
    moon: '0x24404DC041d74cd03cFE28855F555559390C931b',
    start: Number(process.env.START_BLOCK_42161 || 423745962),
  },
  {
    key: 'ethereum', chainId: 1,
    bridge: process.env.BRIDGE_ETHEREUM_ADDRESS || '0x609B1430b6575590F5C75bcb7db261007d5FED41',
    moon: '0xb2490e357980cE57bF5745e181e537a64Eb367B1',
    start: Number(process.env.START_BLOCK_1 || 24284752),
  },
];

const ASSET_ASCII = '0x' + Buffer.from('MOON').toString('hex').padEnd(64, '0');
const ASSET_KECCAK = keccak256(toBytes('MOON'));

const ERC20 = [
  parseAbiItem('function balanceOf(address) view returns (uint256)'),
  parseAbiItem('function totalSupply() view returns (uint256)'),
];
const BRIDGE = [
  parseAbiItem('function getAssetConfig(bytes32) view returns ((bool enabled,address tokenAddress,address lpTokenAddress,uint16 lpFeeBps,uint16 daoFeeBps,uint256 minBridgeAmount,uint256 maxBridgeAmount))'),
  parseAbiItem('function poolStates(bytes32) view returns (uint256 totalDeposited,uint256 accumulatedFees,uint256 totalQueuedWithdrawals)'),
  parseAbiItem('function getTotalPoolValue(bytes32) view returns (uint256)'),
  parseAbiItem('function getAvailableLiquidity(bytes32) view returns (uint256)'),
  parseAbiItem('function getRescuableSurplus(bytes32) view returns (uint256)'),
];

const EV = {
  transfer: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  deposit: parseAbiItem('event LiquidityDeposited(bytes32 indexed assetId, address indexed provider, uint256 amount, uint256 lpTokensMinted)'),
  wreq: parseAbiItem('event WithdrawalRequested(bytes32 indexed assetId, address indexed provider, uint256 lpTokensBurned, uint256 immediateAmount, uint256 queuedAmount, uint256 requestId)'),
  wful: parseAbiItem('event WithdrawalFulfilled(bytes32 indexed assetId, address indexed recipient, uint256 amount, uint256 requestId)'),
  breq: parseAbiItem('event BridgeRequested(bytes32 indexed bridgeId, bytes32 indexed assetId, address indexed sender, address recipient, uint256 amount, uint256 toChainId, uint256 fee)'),
  bful: parseAbiItem('event BridgeFulfilled(bytes32 indexed bridgeId, bytes32 indexed assetId, address indexed recipient, uint256 fulfilledAmount, uint256 requestedAmount, uint256 fromChainId)'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function es(chainId, params) {
  const qs = new URLSearchParams({ chainid: String(chainId), apikey: KEY, ...params });
  await sleep(230); // stay under the 5 req/sec free-tier limit
  const res = await fetch(`${API}?${qs}`);
  const json = await res.json();
  return json;
}

// eth_call via the proxy module; returns decoded result for the given function.
async function call(chainId, to, abi, functionName, args) {
  const data = encodeFunctionData({ abi, functionName, args });
  const json = await es(chainId, { module: 'proxy', action: 'eth_call', to, data, tag: 'latest' });
  if (!json.result || json.result === '0x') throw new Error(`eth_call ${functionName} empty: ${JSON.stringify(json).slice(0, 200)}`);
  return decodeFunctionResult({ abi, functionName, data: json.result });
}

async function blockNumber(chainId) {
  const json = await es(chainId, { module: 'proxy', action: 'eth_blockNumber' });
  return parseInt(json.result, 16);
}

// Paginated getLogs filtered by topic0 (event) and optionally topic1.
async function getLogs(chainId, address, ev, fromBlock, toBlock, topic1) {
  const topic0 = toEventSelector(ev);
  const out = [];
  let from = fromBlock;
  for (;;) {
    const params = {
      module: 'logs', action: 'getLogs', address,
      fromBlock: String(from), toBlock: String(toBlock),
      topic0, page: '1', offset: '1000',
    };
    if (topic1) { params.topic1 = topic1; params.topic0_1_opr = 'and'; }
    const json = await es(chainId, params);
    if (json.status === '0' && json.message && /no records|No records/.test(json.message)) break;
    if (!Array.isArray(json.result)) throw new Error(`getLogs error: ${JSON.stringify(json).slice(0, 200)}`);
    out.push(...json.result);
    if (json.result.length < 1000) break;
    const last = parseInt(json.result[json.result.length - 1].blockNumber, 16);
    from = last + 1; // continue after the last returned block
    if (from > toBlock) break;
  }
  return out;
}

function decode(ev, log) {
  return decodeEventLog({ abi: [ev], data: log.data, topics: log.topics }).args;
}
function add(map, key, delta) {
  const k = getAddress(key);
  map.set(k, (map.get(k) || 0n) + delta);
}

async function resolveAsset(chainId, bridge) {
  for (const [label, id] of [['ascii', ASSET_ASCII], ['keccak', ASSET_KECCAK]]) {
    try {
      const cfg = await call(chainId, bridge, BRIDGE, 'getAssetConfig', [id]);
      if (cfg.lpTokenAddress && cfg.lpTokenAddress !== ZERO) return { label, id, cfg };
    } catch { /* try the other encoding */ }
  }
  return null;
}

async function processChain(chain) {
  const bridge = getAddress(chain.bridge);
  const tip = await blockNumber(chain.chainId);

  const asset = await resolveAsset(chain.chainId, bridge);
  if (!asset) return { key: chain.key, chainId: chain.chainId, error: 'MOON not registered (or chain not on Etherscan V2)' };
  const lpToken = getAddress(asset.cfg.lpTokenAddress);

  // 1. LP balances from Transfer history.
  const lpBalance = new Map();
  for (const log of await getLogs(chain.chainId, lpToken, EV.transfer, chain.start, tip)) {
    const { from, to, value } = decode(EV.transfer, log);
    if (from !== ZERO) add(lpBalance, from, -value);
    if (to !== ZERO) add(lpBalance, to, value);
  }
  for (const [k, v] of [...lpBalance]) if (v === 0n) lpBalance.delete(k);

  // 2. Deposits / withdrawals per address (filtered by assetId in topic1).
  const deposited = new Map();
  const withdrawn = new Map();
  for (const log of await getLogs(chain.chainId, bridge, EV.deposit, chain.start, tip, asset.id)) {
    add(deposited, decode(EV.deposit, log).provider, decode(EV.deposit, log).amount);
  }
  for (const log of await getLogs(chain.chainId, bridge, EV.wreq, chain.start, tip, asset.id)) {
    add(withdrawn, decode(EV.wreq, log).provider, decode(EV.wreq, log).immediateAmount);
  }
  for (const log of await getLogs(chain.chainId, bridge, EV.wful, chain.start, tip, asset.id)) {
    add(withdrawn, decode(EV.wful, log).recipient, decode(EV.wful, log).amount);
  }

  // 3. Bridge flow aggregates.
  let bridgedInPrincipal = 0n, bridgedInFee = 0n, bridgedOut = 0n;
  for (const log of await getLogs(chain.chainId, bridge, EV.breq, chain.start, tip, asset.id)) {
    const a = decode(EV.breq, log); bridgedInPrincipal += a.amount; bridgedInFee += a.fee;
  }
  for (const log of await getLogs(chain.chainId, bridge, EV.bful, chain.start, tip, asset.id)) {
    bridgedOut += decode(EV.bful, log).fulfilledAmount;
  }

  // 4. Live state.
  const pool = await call(chain.chainId, bridge, BRIDGE, 'poolStates', [asset.id]);
  const totalPoolValue = await call(chain.chainId, bridge, BRIDGE, 'getTotalPoolValue', [asset.id]);
  const available = await call(chain.chainId, bridge, BRIDGE, 'getAvailableLiquidity', [asset.id]);
  const moonBalance = await call(chain.chainId, getAddress(chain.moon), ERC20, 'balanceOf', [bridge]);
  const lpSupply = await call(chain.chainId, lpToken, ERC20, 'totalSupply', []);
  let surplus = null;
  try { surplus = await call(chain.chainId, bridge, BRIDGE, 'getRescuableSurplus', [asset.id]); } catch { /* pre-upgrade */ }

  const holders = new Set([...lpBalance.keys(), ...deposited.keys(), ...withdrawn.keys()]);
  const rows = [...holders].map((addr) => {
    const bal = lpBalance.get(addr) || 0n;
    const dep = deposited.get(addr) || 0n;
    const wd = withdrawn.get(addr) || 0n;
    const sharePpm = lpSupply > 0n ? (bal * 1_000_000n) / lpSupply : 0n;
    const lpValue = lpSupply > 0n ? (bal * totalPoolValue) / lpSupply : 0n;
    return {
      address: addr,
      lpBalance: bal.toString(),
      sharePct: Number(sharePpm) / 10_000,
      grossDeposited: dep.toString(),
      grossWithdrawn: wd.toString(),
      netDeposited: (dep - wd).toString(),
      lpValueAtCurrentPool: lpValue.toString(),
    };
  }).sort((a, b) => (BigInt(b.lpBalance) > BigInt(a.lpBalance) ? 1 : -1));

  return {
    key: chain.key, chainId: chain.chainId, bridge, lpToken,
    assetIdEncoding: asset.label, assetId: asset.id,
    live: {
      moonBalance: moonBalance.toString(),
      lpTotalSupply: lpSupply.toString(),
      totalPoolValue: totalPoolValue.toString(),
      poolTotalDeposited: pool[0].toString(),
      poolAccumulatedFees: pool[1].toString(),
      poolQueuedWithdrawals: pool[2].toString(),
      availableLiquidity: available.toString(),
      rescuableSurplus: surplus === null ? 'n/a (pre-upgrade)' : surplus.toString(),
    },
    flow: {
      bridgedInPrincipal: bridgedInPrincipal.toString(),
      bridgedInFee: bridgedInFee.toString(),
      bridgedOut: bridgedOut.toString(),
    },
    holders: rows,
  };
}

function csv(report) {
  const lines = ['chain,address,lpBalance,sharePct,grossDeposited,grossWithdrawn,netDeposited,lpValueAtCurrentPool'];
  for (const c of report.chains) {
    if (c.error) continue;
    for (const r of c.holders) {
      lines.push([c.key, r.address, r.lpBalance, r.sharePct, r.grossDeposited, r.grossWithdrawn, r.netDeposited, r.lpValueAtCurrentPool].join(','));
    }
  }
  return lines.join('\n');
}

(async () => {
  if (!KEY) { process.stderr.write('ERROR: ETHERSCAN_API_KEY missing from relayer/.env\n'); process.exit(1); }

  const chains = [];
  for (const c of CHAINS) {
    process.stderr.write(`scanning ${c.key} (${c.chainId})...\n`);
    try { chains.push(await processChain(c)); }
    catch (e) { chains.push({ key: c.key, chainId: c.chainId, error: String(e?.message || e) }); }
  }

  // Net-deposit refund distribution, keyed by address across all chains.
  const netByAddr = new Map();
  let totalMoon = 0n;
  for (const c of chains) {
    if (c.error) continue;
    totalMoon += BigInt(c.live.moonBalance);
    for (const r of c.holders) {
      const n = BigInt(r.netDeposited);
      if (n !== 0n) netByAddr.set(r.address, (netByAddr.get(r.address) || 0n) + n);
    }
  }
  const totalNet = [...netByAddr.values()].reduce((a, b) => a + (b > 0n ? b : 0n), 0n);
  const netDepositDistribution = [...netByAddr.entries()]
    .filter(([, n]) => n > 0n)
    .map(([address, n]) => ({
      address,
      netDepositedAllChains: n.toString(),
      proRataShareOfTotalMoonPct: totalNet > 0n ? Number((n * 1_000_000n) / totalNet) / 10_000 : 0,
      owedMoon: totalNet > 0n ? ((n * totalMoon) / totalNet).toString() : '0',
    }))
    .sort((a, b) => (BigInt(b.netDepositedAllChains) > BigInt(a.netDepositedAllChains) ? 1 : -1));

  const report = {
    totals: {
      physicalMoonAllChains: totalMoon.toString(),
      physicalMoonAllChainsEther: formatEther(totalMoon),
      totalPositiveNetDeposited: totalNet.toString(),
    },
    netDepositDistribution,
    chains,
  };

  writeFileSync('lp-ledger.json', JSON.stringify(report, null, 2));
  writeFileSync('lp-ledger.csv', csv(report));

  process.stderr.write('\nwrote lp-ledger.json and lp-ledger.csv\n');
  for (const c of chains) {
    if (c.error) { process.stderr.write(`  ${c.key}: ERROR ${c.error}\n`); continue; }
    process.stderr.write(`  ${c.key}: ${c.holders.length} addresses, MOON balance ${formatEther(BigInt(c.live.moonBalance))}, assetId=${c.assetIdEncoding}, surplus=${c.live.rescuableSurplus}\n`);
  }
  process.stderr.write(`  TOTAL physical MOON across chains: ${formatEther(totalMoon)}\n`);
})();
