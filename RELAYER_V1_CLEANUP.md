# Relayer V1 Code Cleanup - Complete ✅

## Objective
Audit and remove all V1 code from the relayer deployment on VPS to ensure only pristine V2 code is running for Ethereum, Gnosis, Arbitrum One, and Arbitrum Nova.

## Issues Found

### 1. V1 index.js Still Present ❌
**Location**: `/opt/moonbridge/relayer/src/index.js`
**Issue**: Old V1 relayer code was still in production directory
**Risk**: Could accidentally be started instead of V2
**Fix**: Renamed to `index.js.v1.backup`

### 2. config.js Had WRONG V2 Event Structure ❌
**Location**: `/opt/moonbridge/relayer/src/config.js`
**Issue**: BridgeRequested event had incorrect parameter structure

**Incorrect (V1-ish hybrid)**:
```javascript
{
  name: 'BridgeRequested',
  inputs: [
    { name: 'bridgeId', type: 'bytes32', indexed: true },
    { name: 'assetId', type: 'bytes32', indexed: true },
    { name: 'fromChainId', type: 'uint256', indexed: true },  // WRONG
    { name: 'toChainId', type: 'uint256', indexed: false },
    { name: 'requester', type: 'address', indexed: false },   // WRONG field name
    { name: 'recipient', type: 'address', indexed: false },
    { name: 'amount', type: 'uint256', indexed: false },
    // MISSING: sender, fee
  ]
}
```

**Correct (V2)**:
```javascript
{
  name: 'BridgeRequested',
  inputs: [
    { name: 'bridgeId', type: 'bytes32', indexed: true },
    { name: 'assetId', type: 'bytes32', indexed: true },
    { name: 'sender', type: 'address', indexed: true },      // CORRECT
    { name: 'recipient', type: 'address', indexed: false },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'toChainId', type: 'uint256', indexed: false },
    { name: 'fee', type: 'uint256', indexed: false },        // ADDED
  ]
}
```

**Impact**: While `index-v2.js` doesn't import from `config.js`, having wrong code could cause confusion
**Fix**: Updated config.js with correct V2 event structure

### 3. Ethereum RPC Block Range Too Large ❌
**Issue**: Trying to fetch 10,000 blocks on Ethereum but LlamaRPC only allows 1,000
**Error**: `eth_getLogs range is too large, max is 1k blocks`
**Fix**: Added per-chain `maxHistoricalBlocks` limits

### 4. PM2 Not Loading .env File ❌
**Issue**: PM2 wasn't setting the correct working directory, so `dotenv/config` couldn't find `.env`
**Error**: `RELAYER_PRIVATE_KEY environment variable required` (crash loop)
**Fix**: Created `ecosystem.config.cjs` with proper `cwd` configuration

## Changes Made

### 1. Removed V1 Code
```bash
# On VPS
mv /opt/moonbridge/relayer/src/index.js /opt/moonbridge/relayer/src/index.js.v1.backup
```

### 2. Fixed config.js Event Structure
Updated BridgeRequested event to match actual V2 contract:
- Changed `fromChainId` (indexed) → removed
- Changed `requester` → `sender` (indexed)
- Added `fee` parameter
- Reordered parameters to match contract

### 3. Added Per-Chain Historical Block Limits
**`src/index-v2.js`**:
```javascript
const CHAINS = {
  42170: { ..., maxHistoricalBlocks: 10000 },  // Nova
  42161: { ..., maxHistoricalBlocks: 10000 },  // One
  1: { ..., maxHistoricalBlocks: 1000 },       // Ethereum (limited)
  100: { ..., maxHistoricalBlocks: 10000 },    // Gnosis
};

// In processHistoricalRequests:
const maxBlocks = BigInt(client.config.maxHistoricalBlocks || 10000);
const fromBlock = currentBlock - maxBlocks < 0n ? 0n : currentBlock - maxBlocks;
```

### 4. Created PM2 Ecosystem Config
**`ecosystem.config.cjs`**:
```javascript
module.exports = {
  apps: [{
    name: 'moonbridge-relayer',
    script: './src/index-v2.js',
    cwd: '/opt/moonbridge/relayer',  // CRITICAL: Sets working directory
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
  }]
};
```

## Verification

### Files on VPS After Cleanup:
```bash
/opt/moonbridge/relayer/
├── src/
│   ├── index-v2.js              ✅ V2 code (active)
│   ├── config.js                ✅ V2 events (corrected)
│   └── index.js.v1.backup       📦 V1 code (archived)
├── ecosystem.config.cjs         ✅ PM2 config
├── .env                         ✅ Environment variables
└── package.json
```

### Running Relayer Status:
```bash
pm2 status
# moonbridge-relayer | online | 0 restarts | 0 errors
```

### Logs Verification:
```bash
pm2 logs moonbridge-relayer --nostream | tail -20

✅ No "eth_getLogs range too large" errors
✅ No "RELAYER_PRIVATE_KEY required" errors
✅ No "Method disabled" Gnosis RPC errors
✅ Successfully watching all 4 chains
✅ Finding and processing historical bridge requests
```

## V2 Event Structures Verified

All chains now using correct V2 structures:

**BridgeRequested**:
- ✅ `bridgeId` (bytes32, indexed)
- ✅ `assetId` (bytes32, indexed)
- ✅ `sender` (address, indexed)
- ✅ `recipient` (address)
- ✅ `amount` (uint256)
- ✅ `toChainId` (uint256)
- ✅ `fee` (uint256)

**BridgeFulfilled**:
- ✅ `bridgeId` (bytes32, indexed)
- ✅ `assetId` (bytes32, indexed)
- ✅ `recipient` (address, indexed)
- ✅ `fulfilledAmount` (uint256)
- ✅ `requestedAmount` (uint256)
- ✅ `fromChainId` (uint256)

## Chain-Specific Configuration

| Chain | RPC | Historical Blocks | Status |
|-------|-----|------------------|--------|
| Arbitrum Nova | https://nova.arbitrum.io/rpc | 10,000 | ✅ Working |
| Arbitrum One | https://arb1.arbitrum.io/rpc | 10,000 | ✅ Working |
| Ethereum | https://eth.llamarpc.com | 1,000 | ✅ Working (RPC limited) |
| Gnosis | https://gnosis.drpc.org | 10,000 | ✅ Working |

## Summary

**Before Cleanup**:
- ❌ V1 code still present (index.js)
- ❌ config.js had wrong event structure
- ❌ Ethereum RPC errors (range too large)
- ❌ PM2 crash loop (.env not loading)
- ❌ Potential confusion between V1/V2

**After Cleanup**:
- ✅ All V1 code archived (index.js.v1.backup)
- ✅ config.js corrected with V2 events
- ✅ Per-chain block limits configured
- ✅ PM2 ecosystem config with proper cwd
- ✅ Zero errors in production
- ✅ All 4 chains running pristine V2 code

**Result**: The relayer is now running 100% clean V2 code with proper event structures for all chains. No V1 code is active or could accidentally be started. 🎉
