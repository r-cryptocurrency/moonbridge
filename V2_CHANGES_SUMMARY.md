# MoonBridge V2 - Complete Changes Summary

## Overview

MoonBridge V2 represents a complete architectural upgrade from a single-asset bridge to a multi-chain, multi-asset bridge with liquidity provider functionality.

---

## What Changed

### V1 (Before)
- **Chains:** 2 (Arbitrum Nova ↔ Arbitrum One)
- **Assets:** 1 (MOON only)
- **Liquidity:** DAO-owned only
- **Fees:** 1% stays in contract
- **Withdrawals:** Not supported for users

### V2 (After)
- **Chains:** 4 (Nova, Arbitrum One, Ethereum, Gnosis) - extensible to more
- **Assets:** 4 (MOON, ETH, USDC, DONUT) - extensible to more
- **Liquidity:** User LP deposits with ERC20 LP tokens
- **Fees:** 0.8% to LPs, 0.2% to DAO wallet
- **Withdrawals:** Pro-rata + FIFO queue system

---

## Files Modified/Created

### Relayer Updates

#### Modified Files

**1. relayer/src/config.js**
- Added Ethereum and Gnosis chain configurations
- Added multi-asset support (MOON, ETH, USDC, DONUT)
- Updated BRIDGE_ABI for V2 events and functions
- Removed V1-specific fee logic
- Added helper functions: `getAllChainConfigs()`, `getAssetAddress()`, `isNativeETH()`, `assetIdToBytes32()`

**Key Changes:**
```javascript
// Before: 2 chains
export const CHAIN_CONFIG = {
  arbitrumNova: { ... },
  arbitrumOne: { ... }
}

// After: 4 chains
export const CHAIN_CONFIG = {
  arbitrumNova: { ... },
  arbitrumOne: { ... },
  ethereum: { ... },
  gnosis: { ... }
}

// New: Multi-asset support
export const ASSETS = {
  MOON: { addresses: { ... } },
  ETH: { addresses: { ... } },
  USDC: { addresses: { ... } },
  DONUT: { addresses: { ... } }
}
```

**2. relayer/src/index.js**
- Complete rewrite for V2 architecture
- Dynamic client initialization for all chains
- Multi-asset bridge request processing
- Native ETH handling with sentinel address
- Removed refund and markCompleted logic (V2 uses withdrawal queue instead)
- Updated event watchers for new BridgeRequested event format

**Key Changes:**
```javascript
// Before: Process V1 bridge request
async function processRequest(clients, request) {
  // Handle fulfill/refund logic
}

// After: Process V2 bridge request
async function processBridgeRequest(clients, bridgeRequest) {
  // Handle multi-asset fulfillment
  // Check liquidity per asset
  // Support native ETH with value parameter
}
```

**3. relayer/.env.example**
- Added Ethereum and Gnosis RPC URLs
- Added bridge addresses for all 4 chains
- Removed token address requirements (now hardcoded in config)

---

### Frontend Updates

#### Modified Files

**1. frontend/src/config/index.ts**
- Added 4 chains configuration
- Added 4 assets with addresses per chain
- Updated BRIDGE_ABI for V2 functions
- Added LP_TOKEN_ABI for liquidity provider tokens
- Updated fee calculation (V2: 0.8% LP, 0.2% DAO)
- Added helper functions for asset/chain management

**Key Changes:**
```typescript
// Before: 2 chains, MOON only
export const CONTRACTS = {
  [CHAIN_IDS.ARBITRUM_NOVA]: {
    bridge: '0x...',
    moonToken: '0x...'
  }
}

// After: 4 chains, 4 assets
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0x...',
  [CHAIN_IDS.ARBITRUM_ONE]: '0x...',
  [CHAIN_IDS.ETHEREUM]: '0x...',
  [CHAIN_IDS.GNOSIS]: '0x...'
}

export const ASSETS = {
  MOON: { symbol: 'MOON', decimals: 18, addresses: {...} },
  ETH: { symbol: 'ETH', decimals: 18, addresses: {...} },
  USDC: { symbol: 'USDC', decimals: 6, addresses: {...} },
  DONUT: { symbol: 'DONUT', decimals: 18, addresses: {...} }
}
```

**2. frontend/src/hooks/useBridge.ts**
- Complete rewrite with two new hooks:
  - `useBridge(chainId, assetId)` - For bridging assets
  - `useLiquidity(chainId, assetId)` - For LP operations
- Native ETH vs ERC20 balance handling
- Asset approval management
- LP token approval and balance tracking

**Key Changes:**
```typescript
// Before: Single hook for MOON only
export function useBridge(sourceChainId: number) {
  // MOON-specific logic
}

// After: Separate hooks for bridging and LP
export function useBridge(chainId: number, assetId: string) {
  // Multi-asset bridge logic
  // Native ETH support
}

export function useLiquidity(chainId: number, assetId: string) {
  // LP deposit/withdraw
  // LP token balance tracking
}
```

---

## Contract Architecture Changes

### V1 Architecture
```
Bridge.sol
├── requestBridge()  - Request MOON transfer
├── fulfill()        - Fulfill on destination
├── refund()         - Refund if insufficient liquidity
└── markCompleted()  - Mark as completed
```

### V2 Architecture
```
BridgeV2.sol (UUPS Upgradeable)
├── User Functions
│   ├── requestBridge(assetId, amount, toChainId, recipient)
│   ├── deposit(assetId, amount)        - Deposit liquidity
│   └── withdraw(assetId, lpAmount)     - Withdraw liquidity
├── Relayer Functions
│   ├── fulfillBridge(bridgeId, assetId, recipient, amount, fromChainId)
│   └── processWithdrawalQueue(assetId) - Process queued withdrawals
└── Admin Functions
    ├── addAsset()
    ├── configureChain()
    ├── configureRoute()
    └── setDaoWallet()

LPToken.sol (ERC20)
└── Minimal ERC20 implementation for LP tokens

LPTokenFactory.sol
└── Deploys LP tokens via Clones pattern
```

---

## Fee Structure Changes

### V1 Fee Structure
```
User bridges 100 MOON
├── 1 MOON fee (1%)
└── Stays in contract
```

### V2 Fee Structure
```
User bridges 100 MOON
├── Total Fee: 1 MOON (1%)
    ├── LP Fee: 0.8 MOON (goes to pool, increases LP value)
    └── DAO Fee: 0.2 MOON (sent to DAO wallet)
```

---

## Liquidity Model Changes

### V1 Liquidity Model
- DAO owns all liquidity
- No user participation
- No yield for liquidity providers

### V2 Liquidity Model
- **Per-asset, per-chain pools**
  - Example: MOON pool on Nova is separate from MOON pool on Ethereum
- **ERC20 LP tokens**
  - Transferable
  - DeFi composable
  - Pro-rata share of pool value
- **Withdrawal Queue System**
  - Immediate withdrawal of available liquidity
  - Queue remainder for when liquidity returns
  - FIFO processing

---

## Supported Assets

| Asset | Nova | Arb One | Ethereum | Gnosis | Notes |
|-------|------|---------|----------|--------|-------|
| MOON  | ✅   | ✅      | ✅       | ❌     | Native r/CryptoCurrency token |
| ETH   | ✅   | ✅      | ✅       | WETH   | Native on most chains |
| USDC  | ✅   | ✅      | ✅       | ✅     | Stablecoin, 6 decimals |
| DONUT | ❌   | ✅      | ✅       | ✅     | r/ethtrader token |

---

## Supported Routes

### MOON Routes
- Nova ↔ Arbitrum One
- Nova ↔ Ethereum
- Arbitrum One ↔ Ethereum

### ETH Routes
- Any chain ↔ Any other chain (4×3 = 12 routes)

### USDC Routes
- Any chain ↔ Any other chain (4×3 = 12 routes)

### DONUT Routes
- Arbitrum One ↔ Ethereum
- Arbitrum One ↔ Gnosis
- Ethereum ↔ Gnosis

**Total Routes:** ~40+ unique asset-chain combinations

---

## Event Changes

### V1 Events
```solidity
event BridgeRequested(
    bytes32 indexed requestId,
    uint256 indexed sourceChainId,
    uint256 indexed destChainId,
    address requester,
    address recipient,
    uint256 amount,
    uint256 ethFeeWei,
    uint256 nonce
)
```

### V2 Events
```solidity
event BridgeRequested(
    bytes32 indexed bridgeId,
    bytes32 indexed assetId,
    uint256 indexed fromChainId,
    uint256 toChainId,
    address requester,
    address recipient,
    uint256 amount
)

event LiquidityDeposited(
    bytes32 indexed assetId,
    address indexed depositor,
    uint256 amount,
    uint256 lpTokensMinted
)

event LiquidityWithdrawn(
    bytes32 indexed assetId,
    address indexed withdrawer,
    uint256 lpTokensBurned,
    uint256 amountReceived,
    uint256 amountQueued
)
```

---

## Breaking Changes

### For Users
1. **V1 pending requests will not be fulfilled by V2**
   - Must be completed or cancelled before migration

### For Integrations
1. **Contract ABIs changed**
   - Update all ABI imports
   - New function signatures

2. **Event structure changed**
   - Update event listeners
   - New indexed parameters

3. **No more refund mechanism**
   - V2 uses withdrawal queues instead

---

## Migration Path (V1 → V2)

### Recommended Steps

1. **Pause V1 Contracts**
   - Stop accepting new bridge requests
   - Allow pending requests to complete

2. **Deploy V2 Contracts**
   - Deploy to all 4 chains
   - Verify contracts
   - Configure routes

3. **Migrate Liquidity**
   - DAO withdraws all liquidity from V1
   - DAO seeds V2 pools (optional)
   - Community provides LP liquidity

4. **Update Infrastructure**
   - Deploy V2 relayer to VPS
   - Update frontend configuration
   - Deploy to moonbridge.cc

5. **Testing**
   - Test on testnets first
   - Small mainnet transactions
   - Full functionality verification

6. **Launch**
   - Announce to community
   - Provide migration guide
   - Monitor closely for first 24-48 hours

---

## Testing Requirements

### Smart Contract Tests
- ✅ Unit tests for all core functions
- ✅ Integration tests for multi-chain scenarios
- ✅ LP deposit/withdraw edge cases
- ✅ Withdrawal queue functionality
- ✅ Fee distribution accuracy
- ✅ Access control

### Relayer Tests
- ✅ Syntax validation passed
- ⏳ Integration testing (after deployment)
- ⏳ Multi-asset fulfillment
- ⏳ Native ETH handling
- ⏳ 4-chain monitoring

### Frontend Tests
- ⏳ Asset selector functionality
- ⏳ Chain switching
- ⏳ Wallet connection (all chains)
- ⏳ Bridge transaction flow
- ⏳ LP deposit/withdraw UI
- ⏳ Balance display accuracy

---

## Security Considerations

### New Attack Vectors
1. **LP Withdrawal Queue Manipulation**
   - Mitigation: FIFO queue, pro-rata distribution

2. **Cross-Chain Replay Attacks**
   - Mitigation: Chain ID in bridge ID hash

3. **LP Token Market Manipulation**
   - Mitigation: Fair pro-rata minting/burning

### Auditing Recommendations
- [ ] Full smart contract audit before mainnet
- [ ] Relayer security review
- [ ] Frontend security assessment
- [ ] Economic model review (fee structure, LP incentives)

---

## Performance Improvements

### V1 Performance
- 2 chains monitored
- Single asset processing
- Simple refund logic

### V2 Performance
- 4 chains monitored simultaneously
- Multi-asset processing in parallel
- Optimized event filtering
- Reduced gas costs with Clones pattern

---

## Documentation Updates Needed

1. **User Guide**
   - How to bridge assets
   - How to provide liquidity
   - Understanding LP tokens and yields

2. **Developer Documentation**
   - Contract interfaces
   - Event specifications
   - Relayer setup guide

3. **API Documentation**
   - If exposing analytics API

4. **FAQ**
   - Migration questions
   - LP mechanics
   - Fee structure

---

## Next Steps After Deployment

### Immediate (Week 1)
- [ ] Monitor relayer health 24/7
- [ ] Track first bridge transactions
- [ ] Monitor LP deposits
- [ ] Check fee distribution

### Short Term (Month 1)
- [ ] Gather user feedback
- [ ] Optimize gas usage if needed
- [ ] Add more chains (Base, Polygon?)
- [ ] Add more assets based on demand

### Long Term (Quarter 1)
- [ ] Governance implementation
- [ ] Additional features (limit orders, aggregation)
- [ ] Mobile app
- [ ] Analytics dashboard

---

## Support Resources

### For Deployment Issues
- Review [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- Check Foundry documentation
- Verify RPC endpoint health

### For Code Questions
- Smart contracts: See `contracts/src/`
- Relayer: See `relayer/src/`
- Frontend: See `frontend/src/`

### For Operational Issues
- Monitor relayer logs: `pm2 logs moonbridge-relayer`
- Check Vercel deployment logs
- Review block explorer transactions

---

## Conclusion

MoonBridge V2 is a complete architectural upgrade that transforms the bridge from a simple MOON-only transfer system to a robust, multi-chain, multi-asset bridge with community liquidity provision.

**Key Achievements:**
- ✅ 4 chains supported
- ✅ 4 assets supported (extensible)
- ✅ LP system with ERC20 tokens
- ✅ Fair fee distribution (0.8% LP, 0.2% DAO)
- ✅ Native ETH support
- ✅ Withdrawal queue system
- ✅ UUPS upgradeability for future improvements

The system is now ready for deployment and will provide significantly more value to the r/CryptoCurrency and r/ethtrader communities.
