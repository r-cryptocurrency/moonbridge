# MoonBridge V2 - Technical Specifications

## Project Overview

**Name:** MoonBridge V2

**Type:** Multi-chain, multi-asset bridge with liquidity provider functionality

**Version:** 2.0.0

**License:** MIT

**Networks:** Arbitrum Nova, Arbitrum One, Ethereum Mainnet, Gnosis Chain

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MoonBridge V2                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Arbitrum Nova│  │ Arbitrum One │  │  Ethereum    │         │
│  │              │  │              │  │              │         │
│  │  BridgeV2    │  │  BridgeV2    │  │  BridgeV2    │         │
│  │  (Proxy)     │  │  (Proxy)     │  │  (Proxy)     │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                    ┌───────▼───────┐                            │
│                    │    Relayer    │                            │
│                    │   (VPS #1)    │                            │
│                    └───────────────┘                            │
│                                                                  │
│                    ┌───────────────┐                            │
│                    │   Frontend    │                            │
│                    │  (Vercel)     │                            │
│                    └───────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Smart Contract Specifications

### BridgeV2.sol

**Type:** UUPS Upgradeable Proxy

**Solidity Version:** ^0.8.20

**Pattern:** Proxy + Implementation

#### Key Features

- Multi-chain support (4+ chains)
- Multi-asset support (4+ assets)
- ERC20 LP token system
- Fixed relayer fees in native gas tokens
- FIFO withdrawal queue
- Pausable emergency stop
- Owner access control

#### State Variables

| Variable | Type | Description |
|----------|------|-------------|
| `lpTokenFactory` | LPTokenFactory | Factory for deploying LP tokens |
| `daoWallet` | address | DAO wallet for fee collection |
| `relayer` | address | Authorized relayer address |
| `paused` | bool | Emergency pause state |
| `bridgeNonce` | uint256 | Nonce for generating bridge IDs |
| `assetConfigs` | mapping | Asset configurations |
| `chainConfigs` | mapping | Chain configurations with relayer fees |
| `routes` | mapping | Enabled routes (assetId => chainId => bool) |
| `poolStates` | mapping | Pool states per asset |
| `processedBridges` | mapping | Processed bridge IDs (replay protection) |
| `bridgeRequests` | mapping | Bridge requests on source chain |
| `queuePointers` | mapping | Withdrawal queue pointers |
| `withdrawalQueues` | mapping | Queued withdrawal requests |
| `relayerFeeBalance` | uint256 | Accumulated relayer fees |

#### Core Functions

##### User Functions

```solidity
function deposit(bytes32 assetId, uint256 amount) external payable
```
- Deposits liquidity and receives LP tokens
- Pro-rata minting based on pool value
- Supports native ETH and ERC20 tokens

```solidity
function withdraw(bytes32 assetId, uint256 lpTokenAmount) external
```
- Burns LP tokens and withdraws underlying asset
- Immediate withdrawal up to available liquidity
- Queued withdrawal for remainder (FIFO)

```solidity
function requestBridge(
    bytes32 assetId,
    uint256 amount,
    uint256 toChainId,
    address recipient
) external payable
```
- Initiates cross-chain bridge transfer
- Charges fixed relayer fee in native gas token
- Deducts 1% bridge fee (0.8% LP, 0.2% DAO)
- Emits `BridgeRequested` event

```solidity
function cancelBridge(bytes32 bridgeId) external
```
- Cancels pending bridge request
- Returns bridged amount (fees not refunded)
- Relayer fee not refunded

##### Relayer Functions

```solidity
function fulfillBridge(
    bytes32 bridgeId,
    bytes32 assetId,
    address recipient,
    uint256 amount,
    uint256 fromChainId
) external onlyRelayer
```
- Fulfills bridge on destination chain
- Checks liquidity availability
- Marks bridge as processed (replay protection)

```solidity
function markBridgeCompleted(bytes32 bridgeId) external onlyRelayer
```
- Marks bridge as completed on source chain
- Called after successful fulfillment

```solidity
function claimRelayerFees() external onlyRelayer
```
- Withdraws accumulated relayer fees
- Transfers native gas tokens to relayer

```solidity
function processWithdrawalQueue(bytes32 assetId) external
```
- Processes pending withdrawal queue
- FIFO order processing
- Partial fulfillment support

##### Admin Functions

```solidity
function addAsset(
    bytes32 assetId,
    address tokenAddress,
    string calldata lpName,
    string calldata lpSymbol
) external onlyOwner
```
- Adds new asset to bridge
- Deploys LP token via factory

```solidity
function updateAssetConfig(...) external onlyOwner
```
- Updates asset parameters
- Fee configuration, min/max amounts

```solidity
function configureChain(
    uint256 chainId,
    bool enabled,
    uint256 gasSubsidyFee,
    uint256 relayerFee
) external onlyOwner
```
- Configures chain parameters
- Sets relayer fee for chain

```solidity
function configureRoute(
    bytes32 assetId,
    uint256 chainId,
    bool enabled
) external onlyOwner
```
- Enables/disables routes
- Asset-chain pair configuration

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```
- Emergency pause/unpause

#### Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `BridgeRequested` | bridgeId, assetId, sender, recipient, amount, toChainId, fee | User requests bridge |
| `BridgeFulfilled` | bridgeId, assetId, recipient, amount, fromChainId | Relayer fulfills bridge |
| `LiquidityDeposited` | assetId, depositor, amount, lpTokensMinted | LP deposits liquidity |
| `WithdrawalRequested` | assetId, withdrawer, lpTokensBurned, immediateAmount, queuedAmount, requestId | LP withdraws with queue |
| `WithdrawalFulfilled` | assetId, recipient, amount, requestId | Queue withdrawal processed |
| `AssetAdded` | assetId, tokenAddress, lpTokenAddress | New asset added |
| `ChainConfigured` | chainId, enabled | Chain config updated |
| `RouteConfigured` | assetId, chainId, enabled | Route enabled/disabled |

### LPToken.sol

**Type:** ERC20 Token (Minimal Proxy)

**Pattern:** Clone/Minimal Proxy (EIP-1167)

#### Specifications

- Standard ERC20 implementation
- Mintable/Burnable by bridge only
- Transferable (DeFi composable)
- Deployed via Clones pattern (gas efficient)

#### Functions

```solidity
function initialize(string memory name, string memory symbol, address bridge) external
```
- Initializes cloned LP token
- Called once by factory

```solidity
function mint(address to, uint256 amount) external onlyBridge
```
- Mints LP tokens (deposit liquidity)

```solidity
function burn(address from, uint256 amount) external onlyBridge
```
- Burns LP tokens (withdraw liquidity)

### LPTokenFactory.sol

**Type:** Factory Contract

#### Purpose

- Deploys LP tokens via minimal proxy pattern
- Reduces gas costs for LP token deployment
- Tracks all deployed LP tokens

#### Functions

```solidity
function deployLPToken(
    string memory name,
    string memory symbol,
    address bridge
) external returns (address lpToken)
```
- Deploys new LP token clone
- Initializes with name, symbol, bridge

### BridgeTypes.sol

**Type:** Library

#### Constants

```solidity
address constant NATIVE_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

// Chain IDs
uint256 constant CHAIN_ARBITRUM_NOVA = 42170;
uint256 constant CHAIN_ARBITRUM_ONE = 42161;
uint256 constant CHAIN_ETHEREUM = 1;
uint256 constant CHAIN_GNOSIS = 100;

// Asset IDs (keccak256)
bytes32 constant ASSET_MOON = keccak256("MOON");
bytes32 constant ASSET_ETH = keccak256("ETH");
bytes32 constant ASSET_USDC = keccak256("USDC");
bytes32 constant ASSET_DONUT = keccak256("DONUT");

// Fee configuration
uint16 constant DEFAULT_LP_FEE_BPS = 80;    // 0.8%
uint16 constant DEFAULT_DAO_FEE_BPS = 20;   // 0.2%
uint16 constant TOTAL_FEE_BPS = 100;        // 1%
uint16 constant BPS_DENOMINATOR = 10000;
```

#### Structs

```solidity
struct AssetConfig {
    bool enabled;
    address tokenAddress;
    address lpTokenAddress;
    uint16 lpFeeBps;
    uint16 daoFeeBps;
    uint256 minBridgeAmount;
    uint256 maxBridgeAmount;
}

struct ChainConfig {
    bool enabled;
    uint256 gasSubsidyFee;
    uint256 relayerFee;  // Fixed relayer fee per bridge
}

struct PoolState {
    uint256 totalDeposited;
    uint256 accumulatedFees;
    uint256 totalQueuedWithdrawals;
}

struct WithdrawalRequest {
    address recipient;
    uint256 amount;
    uint256 lpTokensBurned;
    uint64 timestamp;
    uint64 nextId;
}

struct BridgeRequest {
    bytes32 assetId;
    address sender;
    address recipient;
    uint256 amount;
    uint256 toChainId;
    uint256 relayerFee;
    uint64 timestamp;
    uint64 nonce;
    bool fulfilled;
    bool refunded;
}
```

## Network Specifications

### Supported Chains

| Chain | Chain ID | Native Token | Block Time | RPC |
|-------|----------|--------------|------------|-----|
| Arbitrum Nova | 42170 | ETH | ~0.25s | https://nova.arbitrum.io/rpc |
| Arbitrum One | 42161 | ETH | ~0.25s | https://arb1.arbitrum.io/rpc |
| Ethereum | 1 | ETH | ~12s | https://eth.llamarpc.com |
| Gnosis | 100 | xDAI | ~5s | https://rpc.gnosischain.com |

### Relayer Fees Per Chain

| Chain | Relayer Fee |
|-------|-------------|
| Arbitrum Nova | 0.0001 ETH |
| Arbitrum One | 0.0001 ETH |
| Ethereum | 0.001 ETH |
| Gnosis | 0.3 xDAI |

## Asset Specifications

### Supported Assets

| Asset | Symbol | Decimals | Type | Chains Available |
|-------|--------|----------|------|------------------|
| Moon | MOON | 18 | ERC20 | Nova, Arbitrum One, Ethereum |
| Ethereum | ETH | 18 | Native | Nova, Arbitrum One, Ethereum, Gnosis (WETH) |
| USD Coin | USDC | 6 | ERC20 | All chains |
| Donut | DONUT | 18 | ERC20 | Arbitrum One, Ethereum, Gnosis |

### Asset Addresses

#### MOON Token

| Chain | Address |
|-------|---------|
| Arbitrum Nova | `0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0` |
| Arbitrum One | `0x24404DC041d74cd03cFE28855F555559390C931b` |
| Ethereum | `0xb2490e357980cE57bF5745e181e537a64Eb367B1` |
| Gnosis | N/A |

#### ETH/WETH

| Chain | Address |
|-------|---------|
| Arbitrum Nova | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (native) |
| Arbitrum One | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (native) |
| Ethereum | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (native) |
| Gnosis | `0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1` (WETH) |

#### USDC Token

| Chain | Address |
|-------|---------|
| Arbitrum Nova | `0x750ba8b76187092b0d1e87e28daaf484d1b5273b` |
| Arbitrum One | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Gnosis | `0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83` |

#### DONUT Token

| Chain | Address |
|-------|---------|
| Arbitrum Nova | N/A |
| Arbitrum One | `0xF42e2B8bc2aF8B110b65be98dB1321B1ab8D44f5` |
| Ethereum | `0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9` |
| Gnosis | `0x524B969793a64a602342d89BC2789D43a016B13A` |

### Supported Routes

Total supported routes: **~40 unique asset-chain combinations**

#### MOON Routes (3)
- Arbitrum Nova ↔ Arbitrum One
- Arbitrum Nova ↔ Ethereum
- Arbitrum One ↔ Ethereum

#### ETH Routes (12)
- All chains ↔ All other chains (4 × 3 = 12)

#### USDC Routes (12)
- All chains ↔ All other chains (4 × 3 = 12)

#### DONUT Routes (6)
- Arbitrum One ↔ Ethereum
- Arbitrum One ↔ Gnosis
- Ethereum ↔ Gnosis

## Fee Structure

### Bridge Fees (from bridged amount)

| Fee Type | Rate | Recipient | Purpose |
|----------|------|-----------|---------|
| LP Fee | 0.8% (80 BPS) | LP Pool | Increases LP token value |
| DAO Fee | 0.2% (20 BPS) | CCMOON DAO Wallet | CCMOON DAO treasury |
| **Total Bridge Fee** | **1.0% (100 BPS)** | - | - |

### Relayer Fees (additional, in native gas token)

| Chain | Fee | Token |
|-------|-----|-------|
| Arbitrum Nova | 0.0001 | ETH |
| Arbitrum One | 0.0001 | ETH |
| Ethereum | 0.001 | ETH |
| Gnosis | 0.3 | xDAI |

### Fee Calculation Example

**Bridge 100 MOON from Nova to Arbitrum One:**

```
Input: 100 MOON
Bridge Fee: 1 MOON (0.8 MOON to LP, 0.2 MOON to CCMOON DAO)
Relayer Fee: 0.0001 ETH (separate payment)
Output: 99 MOON received on Arbitrum One

User Pays:
- 100 MOON (transferred to bridge)
- 0.0001 ETH (relayer fee in msg.value)

Distribution:
- 0.8 MOON → LP pool (increases all LP token values)
- 0.2 MOON → CCMOON DAO wallet
- 99 MOON → recipient on Arbitrum One
- 0.0001 ETH → relayerFeeBalance (claimable by relayer)
```

## Liquidity Provider Specifications

### LP Token Economics

**Minting Formula:**
```
First Deposit: lpTokens = amount (1:1 ratio)
Subsequent: lpTokens = (amount × totalSupply) / totalPoolValue
```

**Redemption Formula:**
```
assetAmount = (lpTokens × totalPoolValue) / totalSupply
```

**Pool Value:**
```
totalPoolValue = totalDeposited + accumulatedFees
```

### Withdrawal Queue System

**When Available Liquidity < Withdrawal Amount:**
1. Immediate withdrawal: `min(requested, available)`
2. Queue remainder: `requested - immediate`
3. FIFO processing when liquidity returns
4. Partial fulfillment supported

**Queue Structure:**
- Linked list (gas efficient)
- Head pointer: first in queue
- Tail pointer: last in queue
- Next request ID auto-increment

## Relayer Specifications

### Relayer Responsibilities

1. **Monitor Events:** Watch `BridgeRequested` on all 4 chains
2. **Check Liquidity:** Verify destination has sufficient liquidity
3. **Fulfill Bridges:** Call `fulfillBridge()` on destination chain
4. **Mark Complete:** Call `markBridgeCompleted()` on source chain
5. **Process Queues:** Call `processWithdrawalQueue()` when liquidity returns
6. **Claim Fees:** Periodically call `claimRelayerFees()` on all chains

### Relayer Configuration

**Environment Variables:**
```bash
RELAYER_PRIVATE_KEY=0x...

ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

BRIDGE_NOVA_ADDRESS=0x...
BRIDGE_ONE_ADDRESS=0x...
BRIDGE_ETHEREUM_ADDRESS=0x...
BRIDGE_GNOSIS_ADDRESS=0x...

POLL_INTERVAL_MS=5000
MAX_RETRIES=3
RETRY_DELAY_MS=10000
GAS_MULTIPLIER=1.2
```

### Relayer Tech Stack

- **Runtime:** Node.js v18+
- **Libraries:** viem, ethers
- **Process Manager:** PM2
- **Hosting:** VPS (Ubuntu 20.04+)

## Frontend Specifications

### Tech Stack

- **Framework:** Next.js 14+
- **Web3:** wagmi, viem
- **Wallet:** RainbowKit / wagmi connectors
- **Styling:** Tailwind CSS
- **Hosting:** Vercel
- **Domain:** moonbridge.cc

### Key Components

```typescript
// Bridge Component
useBridge(chainId: number, assetId: string)
- assetBalance: bigint
- allowance: bigint
- liquidity: bigint
- approve(amount?: bigint): void
- requestBridge(amount, toChainId, recipient): void
- isNativeAsset: boolean

// Liquidity Provider Component
useLiquidity(chainId: number, assetId: string)
- assetBalance: bigint
- lpBalance: bigint
- lpTotalSupply: bigint
- poolLiquidity: bigint
- approveAsset(amount?: bigint): void
- deposit(amount: bigint): void
- withdraw(lpAmount: bigint): void
```

### Configuration

```typescript
// Chain IDs
ARBITRUM_NOVA = 42170
ARBITRUM_ONE = 42161
ETHEREUM = 1
GNOSIS = 100

// Asset IDs
MOON = "MOON"
ETH = "ETH"
USDC = "USDC"
DONUT = "DONUT"

// Relayer Fees
RELAYER_FEES = {
  42170: 0.0001 ETH
  42161: 0.0001 ETH
  1: 0.001 ETH
  100: 0.3 xDAI
}
```

## Security Specifications

### Access Control

| Role | Permissions |
|------|-------------|
| Owner | Add assets, configure chains/routes, pause/unpause, upgrade contract |
| Relayer | Fulfill bridges, mark completed, process withdrawal queues, claim fees |
| User | Deposit, withdraw, request bridge, cancel bridge |

### Security Features

1. **Reentrancy Protection:** `ReentrancyGuard` on all state-changing functions
2. **Replay Protection:** `processedBridges` mapping prevents double-fulfillment
3. **Pausable:** Emergency stop mechanism
4. **UUPS Upgradeable:** Bug fixes and improvements possible
5. **Access Control:** Owner and relayer roles strictly enforced
6. **Balance Isolation:** Relayer fees separated from pool liquidity
7. **Safe Math:** Solidity 0.8+ built-in overflow protection

### Potential Attack Vectors & Mitigations

| Attack Vector | Mitigation |
|---------------|------------|
| LP Withdrawal Queue Manipulation | FIFO queue, pro-rata distribution |
| Cross-Chain Replay | Chain ID in bridge ID hash |
| LP Token Market Manipulation | Fair pro-rata minting/burning |
| Relayer Fee Drain | Only relayer can claim, separate from pool |
| Double Fulfillment | `processedBridges` mapping check |
| Reentrancy | `nonReentrant` modifier |

## Performance Specifications

### Gas Costs (Estimates)

| Operation | Arbitrum Nova/One | Ethereum | Gnosis |
|-----------|-------------------|----------|--------|
| Deposit Liquidity | ~150k gas | ~150k gas | ~150k gas |
| Withdraw Liquidity | ~200k gas | ~200k gas | ~200k gas |
| Request Bridge | ~180k gas | ~180k gas | ~180k gas |
| Fulfill Bridge | ~120k gas | ~120k gas | ~120k gas |
| Claim Relayer Fees | ~30k gas | ~30k gas | ~30k gas |

### Transaction Timing

| Step | Duration |
|------|----------|
| User Request Bridge | ~1-2 seconds (tx confirmation) |
| Relayer Detection | ~5-10 seconds (polling interval) |
| Relayer Fulfillment | ~1-2 seconds (tx confirmation) |
| **Total Bridge Time** | **~7-14 seconds** |

### Scalability

- **Concurrent Bridges:** Unlimited (no ordering requirements)
- **LP Providers:** Unlimited (permissionless)
- **Supported Assets:** Unlimited (owner can add)
- **Supported Chains:** Unlimited (owner can add)

## Deployment Specifications

### Contract Deployment Order

1. Deploy LP Token implementation
2. Deploy LP Token Factory (with implementation address)
3. Deploy BridgeV2 implementation
4. Deploy UUPS Proxy (with implementation + init data)
5. Configure assets (calls `addAsset()`)
6. Configure routes (calls `configureRoute()`)
7. Seed initial liquidity (optional)

### Environment Requirements

**Smart Contracts:**
- Foundry (forge, cast, anvil)
- Solidity 0.8.20+
- OpenZeppelin Contracts 5.x

**Relayer:**
- Node.js 18+
- npm/yarn
- PM2 (process manager)
- Ubuntu 20.04+ (VPS)

**Frontend:**
- Node.js 18+
- Next.js 14+
- Vercel CLI

## Testing Specifications

### Unit Tests Required

- ✅ Asset deposit (first deposit, subsequent deposits)
- ✅ Asset withdrawal (full immediate, partial + queue)
- ✅ Bridge request (native ETH, ERC20, with relayer fee)
- ✅ Bridge fulfillment (success, replay protection)
- ✅ Withdrawal queue (FIFO, partial fulfillment)
- ✅ Fee distribution (LP fees, DAO fees)
- ✅ Relayer fee accumulation and claiming
- ✅ Access control (owner, relayer, user permissions)
- ✅ Pause/unpause functionality
- ✅ LP token minting/burning math

### Integration Tests Required

- Multi-chain bridge flow (request on A, fulfill on B)
- Withdrawal queue processing after liquidity return
- Native ETH vs ERC20 handling
- Relayer fee payment in different scenarios
- Route enablement/disablement

### Testnet Deployment

**Recommended Testnets:**
- Arbitrum Sepolia (testnet for Arbitrum)
- Ethereum Sepolia
- Gnosis Chiado (testnet for Gnosis)

## Upgrade Path

### UUPS Upgradeability

**Upgrade Process:**
1. Deploy new implementation contract
2. Call `upgradeTo(newImplementation)` on proxy (owner only)
3. New implementation takes effect immediately
4. Storage layout must be compatible

**Storage Layout:**
```solidity
// Slot 0-50: OpenZeppelin upgradeable contracts
// Slot 51: lpTokenFactory
// Slot 52: daoWallet
// Slot 53: relayer
// Slot 54: paused
// Slot 55: bridgeNonce
// Slot 56+: mappings and additional state
```

### Upgrade Migration SOP

1. Pause all contracts
2. Complete all pending requests
3. Withdraw all liquidity
4. Deploy new contracts
5. Seed new liquidity
6. Update relayer and frontend
7. Announce to community

## Monitoring & Analytics

### Key Metrics to Track

**Bridge Metrics:**
- Total bridges (count)
- Total volume (per asset, per chain)
- Average bridge size
- Bridge success rate
- Average bridge time

**Liquidity Metrics:**
- Total liquidity (per asset, per chain)
- LP count (unique addresses)
- Withdrawal queue length
- Withdrawal queue value

**Relayer Metrics:**
- Relayer fee balance (per chain)
- Gas costs (per chain)
- Profit margin
- Uptime

**Fee Metrics:**
- LP fees accumulated
- DAO fees collected
- Relayer fees collected

### Recommended Monitoring Tools

- **Block Explorers:** Arbiscan, Etherscan, GnosisScan
- **The Graph:** Subgraph for historical data
- **Dune Analytics:** Custom dashboards
- **PM2 Logs:** Relayer monitoring
- **Vercel Analytics:** Frontend monitoring

## API Reference

### Contract ABIs

Full ABIs available in:
- `frontend/src/config/index.ts` (TypeScript)
- Contract source files (Solidity)

### Key External Interfaces

**ERC20 Interface:**
```solidity
function balanceOf(address account) external view returns (uint256);
function allowance(address owner, address spender) external view returns (uint256);
function approve(address spender, uint256 amount) external returns (bool);
function transfer(address to, uint256 amount) external returns (bool);
function transferFrom(address from, address to, uint256 amount) external returns (bool);
```

**LP Token Interface:**
```solidity
function totalSupply() external view returns (uint256);
function balanceOf(address account) external view returns (uint256);
function mint(address to, uint256 amount) external;
function burn(address from, uint256 amount) external;
```

## Support & Resources

### Documentation

- [README.md](./README.md) - Project overview
- [SPECIFICATIONS.md](./SPECIFICATIONS.md) - This document

### External Resources

- **Foundry:** https://book.getfoundry.sh
- **OpenZeppelin:** https://docs.openzeppelin.com
- **Viem:** https://viem.sh
- **Wagmi:** https://wagmi.sh
- **Next.js:** https://nextjs.org/docs

### Community

- **GitHub:** https://github.com/r-cryptocurrency/moonbridge
- **Subreddit:** [r/CryptoCurrency](https://www.reddit.com/r/CryptoCurrency)
- **Website:** https://moonbridge.cc

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | Dec 2025 | Initial release (2 chains, MOON only) |
| 1.0.0 | Jan 2026 | Multi-chain, multi-asset, LP system, relayer fees |

## License

MIT License - See LICENSE file for details

---

**Last Updated:** January 2026
**Document Version:** 1.0.0
**Contract Version:** 1.0.0
