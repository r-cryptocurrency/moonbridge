# MoonBridge V2 - Quick Start Deployment Guide

## What Changed from Previous Session

In the previous session, we completed:
- ✅ Relayer code updates (Phase 4)
- ✅ Frontend code updates (Phase 5)
- ✅ Documentation (V2_CHANGES_SUMMARY.md, DEPLOYMENT_GUIDE.md)

**In this session, we added:**
- ✅ **BridgeV2.sol** - Complete V2 smart contract with relayer fee mechanism
- ✅ **LPTokenFactory.sol** - LP token deployment factory
- ✅ **DeployBridgeV2.s.sol** - Complete deployment scripts
- ✅ **Relayer fee implementation** - Fixed native gas fees for operational independence
- ✅ **Frontend updates** - Include relayer fees in transactions

## Critical Feature: Relayer Fees

**User Requirement:**
> "I want the relayer to be able to run forever, even if nobody touches it."

**Solution:**
Users pay a small fixed fee in native gas tokens (ETH/xDAI) with every bridge transaction. These fees accumulate in the contract and the relayer can claim them periodically to cover gas costs.

**Fees:**
- Arbitrum Nova: 0.0001 ETH per bridge
- Arbitrum One: 0.0001 ETH per bridge
- Ethereum: 0.001 ETH per bridge
- Gnosis: 0.3 xDAI per bridge

## File Structure

```
moonbridge/
├── contracts/
│   ├── src/
│   │   ├── BridgeV2.sol ⭐ NEW - Main V2 bridge with relayer fees
│   │   ├── LPToken.sol
│   │   ├── LPTokenFactory.sol ⭐ NEW
│   │   ├── Bridge.sol (V1 - keep for reference)
│   │   ├── interfaces/
│   │   │   ├── IBridgeV2.sol
│   │   │   └── ILPToken.sol
│   │   └── libraries/
│   │       └── BridgeTypes.sol
│   ├── script/
│   │   ├── DeployBridgeV2.s.sol ⭐ NEW - Complete deployment scripts
│   │   └── DeployBridge.s.sol (V1)
│   └── test/
│       └── Bridge.t.sol (needs V2 tests)
├── relayer/
│   ├── src/
│   │   ├── index.js ✅ Updated for V2
│   │   └── config.js ✅ Updated for V2
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.ts ⭐ Updated with RELAYER_FEES
│   │   └── hooks/
│   │       └── useBridge.ts ⭐ Updated to include relayer fees
│   └── ...
├── V2_CHANGES_SUMMARY.md
├── DEPLOYMENT_GUIDE.md
├── RELAYER_FEE_IMPLEMENTATION.md ⭐ NEW
└── QUICK_START_V2.md ⭐ NEW (this file)
```

## Deployment Steps

### Prerequisites

1. Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. Set up environment variables in `.env`:
```bash
# In contracts/ directory
PRIVATE_KEY=0x...
OWNER=0x...           # Your multisig or admin address
DAO_WALLET=0x...      # DAO wallet for fee collection
RELAYER=0x...         # Relayer wallet address

# RPC URLs
ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

# API Keys for verification
ARBISCAN_API_KEY=...
ETHERSCAN_API_KEY=...
GNOSISSCAN_API_KEY=...
```

### Step 1: Deploy Contracts (All 4 Chains)

```bash
cd contracts

# Load environment variables
source .env

# Deploy to Arbitrum Nova
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

# Note the proxy address, then configure assets
export BRIDGE_PROXY=0x... # Proxy address from deployment
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast

# Configure routes
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast

# Repeat for Arbitrum One
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

export BRIDGE_PROXY=0x...
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast

# Repeat for Ethereum
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

export BRIDGE_PROXY=0x...
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast

# Repeat for Gnosis
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $GNOSISSCAN_API_KEY

export BRIDGE_PROXY=0x...
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast
```

**IMPORTANT:** Note all 4 proxy addresses. You'll need them for the relayer and frontend.

### Step 2: Update Frontend Config

```bash
cd frontend/src/config
nano index.ts
```

Update the `BRIDGE_ADDRESSES` with your deployed proxy addresses:

```typescript
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0xYOUR_NOVA_PROXY' as Address,
  [CHAIN_IDS.ARBITRUM_ONE]: '0xYOUR_ONE_PROXY' as Address,
  [CHAIN_IDS.ETHEREUM]: '0xYOUR_ETH_PROXY' as Address,
  [CHAIN_IDS.GNOSIS]: '0xYOUR_GNOSIS_PROXY' as Address,
} as const;
```

### Step 3: Deploy Frontend to Vercel

```bash
cd frontend

# Test locally first
npm install
npm run dev
# Visit http://localhost:3000 and test

# Deploy to Vercel
vercel --prod
```

Configure custom domain `moonbridge.cc` in Vercel dashboard.

### Step 4: Setup Relayer on VPS

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Clone repo (if not already there)
cd /opt
git clone https://github.com/r-cryptocurrency/moonbridge.git
cd moonbridge/relayer

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env
```

Update `.env`:
```bash
RELAYER_PRIVATE_KEY=0x...

ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

BRIDGE_NOVA_ADDRESS=0xYOUR_NOVA_PROXY
BRIDGE_ONE_ADDRESS=0xYOUR_ONE_PROXY
BRIDGE_ETHEREUM_ADDRESS=0xYOUR_ETH_PROXY
BRIDGE_GNOSIS_ADDRESS=0xYOUR_GNOSIS_PROXY
```

**Fund the relayer wallet on all 4 chains:**
- Nova: 0.1 ETH
- Arbitrum One: 0.1 ETH
- Ethereum: 1 ETH
- Gnosis: 0.5 xDAI

Start the relayer:
```bash
# Install PM2
npm install -g pm2

# Start relayer
pm2 start src/index.js --name moonbridge-relayer

# Save configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

### Step 5: Test Complete Flow

1. **Visit moonbridge.cc**
2. **Connect wallet** (MetaMask on Arbitrum Nova)
3. **Select asset** (e.g., MOON)
4. **Enter amount** (e.g., 10 MOON)
5. **Select destination** (e.g., Arbitrum One)
6. **Note the fees:**
   - Bridge fee: 1% (0.1 MOON)
   - Relayer fee: 0.0001 ETH
7. **Approve MOON** (if ERC20)
8. **Confirm bridge** (pay 10 MOON + 0.0001 ETH)
9. **Wait for fulfillment** (~30 seconds)
10. **Check destination wallet** (should receive 9.9 MOON)

### Step 6: Seed Initial Liquidity (Optional)

If you want to provide initial liquidity as the DAO:

```bash
cd contracts

# Set environment variables
export BRIDGE_PROXY=0xYOUR_NOVA_PROXY
export ASSET_ID=0x$(echo -n "MOON" | xxd -p)000000000000000000000000000000000000000000000000000000000000
export AMOUNT=1000000000000000000000  # 1000 MOON

# Approve MOON first (if not native ETH)
cast send 0xMOON_TOKEN_ADDRESS "approve(address,uint256)" $BRIDGE_PROXY $AMOUNT \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --private-key $PRIVATE_KEY

# Deposit liquidity
forge script script/DeployBridgeV2.s.sol:SeedLiquidityV2 \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast
```

## Monitoring

### Check Relayer Status

```bash
ssh user@vps

# View logs
pm2 logs moonbridge-relayer

# Check status
pm2 status

# Restart if needed
pm2 restart moonbridge-relayer
```

### Check Relayer Fee Balance

```bash
# On any chain, check accumulated fees
cast call $BRIDGE_PROXY "relayerFeeBalance()(uint256)" --rpc-url $ARBITRUM_NOVA_RPC_URL
```

### Claim Relayer Fees

```bash
# When balance is sufficient, claim fees
cast send $BRIDGE_PROXY "claimRelayerFees()" \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --private-key $RELAYER_PRIVATE_KEY
```

**Recommended:** Set up a cron job to auto-claim when balance > 0.1 ETH.

## Contract Addresses (Fill in after deployment)

### Arbitrum Nova (42170)
- Proxy: `0x...`
- Implementation: `0x...`
- LP Token Factory: `0x...`

### Arbitrum One (42161)
- Proxy: `0x...`
- Implementation: `0x...`
- LP Token Factory: `0x...`

### Ethereum (1)
- Proxy: `0x...`
- Implementation: `0x...`
- LP Token Factory: `0x...`

### Gnosis (100)
- Proxy: `0x...`
- Implementation: `0x...`
- LP Token Factory: `0x...`

## Troubleshooting

### Contract Deployment Fails

**Error:** "Insufficient funds"
- **Solution:** Ensure deployer wallet has enough ETH on all chains

**Error:** "Verification failed"
- **Solution:** Verify manually using the commands printed by the deployment script

### Relayer Not Detecting Events

```bash
# Check relayer logs
pm2 logs moonbridge-relayer

# Verify RPC URLs are accessible
curl -X POST $ARBITRUM_NOVA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Restart relayer
pm2 restart moonbridge-relayer
```

### Frontend Not Connecting

- Check MetaMask is on correct chain
- Verify bridge addresses in `frontend/src/config/index.ts`
- Check browser console for errors
- Verify Vercel deployment succeeded

## Support

For issues:
1. Check the logs: `pm2 logs moonbridge-relayer`
2. Review transaction on block explorer
3. Check contract state using cast commands
4. Review [RELAYER_FEE_IMPLEMENTATION.md](./RELAYER_FEE_IMPLEMENTATION.md) for details
5. Review [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for comprehensive guide

## Summary

You now have:
- ✅ Complete V2 smart contracts with relayer fee mechanism
- ✅ Deployment scripts for all 4 chains
- ✅ Frontend updated to include relayer fees
- ✅ Relayer ready for multi-chain operation
- ✅ Documentation for deployment and operation

The relayer will accumulate gas token fees from every bridge transaction and can operate indefinitely without manual funding!

**Next:** Deploy to testnets first (Arbitrum Sepolia, Ethereum Sepolia) to test the full flow before mainnet deployment.
