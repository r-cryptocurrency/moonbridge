// Build the Merkle tree for the MerkleDistributor from the reconstructed ledger.
//
// READ-ONLY (local files). Reads lp-ledger.json (produced by reconstruct-lp-ledger.mjs),
// uses the net-deposit `owedMoon` per address, and emits:
//   - the Merkle root to put in the MerkleDistributor constructor
//   - merkle.json: per-address { index, amount, proof } for the claim UI/script
//
// Leaf scheme matches MerkleDistributor.sol and the Uniswap standard:
//   leaf = keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))
//   node = keccak256(sorted(left, right))
//
// Run:  node scripts/build-merkle.mjs
// Out:  ./merkle.json

import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256, encodePacked, concat } from 'viem';

const ledger = JSON.parse(readFileSync('lp-ledger.json', 'utf8'));
const entries = (ledger.netDepositDistribution || [])
  .filter((e) => BigInt(e.owedMoon) > 0n)
  .map((e, index) => ({ index, account: e.address, amount: BigInt(e.owedMoon) }));

if (entries.length === 0) {
  process.stderr.write('No positive entitlements in lp-ledger.json. Run reconstruct-lp-ledger.mjs first.\n');
  process.exit(1);
}

const leafOf = (e) =>
  keccak256(encodePacked(['uint256', 'address', 'uint256'], [BigInt(e.index), e.account, e.amount]));

const hashPair = (a, b) => (BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

// Build layers bottom-up; carry an odd trailing node up unchanged (sorted-pair convention).
const leaves = entries.map(leafOf);
const layers = [leaves];
while (layers[layers.length - 1].length > 1) {
  const prev = layers[layers.length - 1];
  const next = [];
  for (let i = 0; i < prev.length; i += 2) {
    next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
  }
  layers.push(next);
}
const root = layers[layers.length - 1][0];

function proof(leafIndex) {
  const p = [];
  let idx = leafIndex;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l];
    const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pairIndex < layer.length) p.push(layer[pairIndex]);
    idx = Math.floor(idx / 2);
  }
  return p;
}

const claims = {};
let total = 0n;
for (const e of entries) {
  total += e.amount;
  claims[e.account] = { index: e.index, amount: e.amount.toString(), proof: proof(e.index) };
}

writeFileSync('merkle.json', JSON.stringify({ merkleRoot: root, count: entries.length, totalAmount: total.toString(), claims }, null, 2));

process.stderr.write(`merkleRoot: ${root}\n`);
process.stderr.write(`entries: ${entries.length}, total owed: ${total} wei\n`);
process.stderr.write('wrote merkle.json\n');
