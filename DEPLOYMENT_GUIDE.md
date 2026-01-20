# MoonBridge V2 Deployment Guide

## Overview

MoonBridge V2 is a complete upgrade from single-asset (MOON only) to multi-chain, multi-asset bridge with LP functionality.

**New Features:**
- 4 chains: Arbitrum Nova, Arbitrum One, Ethereum, Gnosis
- 4 assets: MOON, ETH, USDC, DONUT
- Liquidity Provider (LP) system with ERC20 LP tokens
- Fee split: 0.8% to LPs, 0.2% to DAO

---

## Architecture Components

### 1. Smart Contracts (On-Chain)
- **BridgeV2.sol** - Main bridge contract (UUPS upgradeable)
- **LPToken.sol** - ERC20 LP token implementation
- **LPTokenFactory.sol** - Deploys LP tokens via Clones pattern

### 2. Relayer (VPS #1)
- Monitors all 4 chains for bridge requests
- Fulfills bridges on destination chains
- Handles multi-asset transfers

### 3. Frontend (Vercel - moonbridge.cc)
- Asset selection UI
- Chain selection (4 chains)
- Bridge interface
- LP deposit/withdraw interface

---

## Deployment Steps

### Phase 1: Deploy Smart Contracts

#### Prerequisites
- Foundry installed
- Private key with ETH/gas on all 4 chains
- RPC URLs for all chains

#### Step 1.1: Deploy to Testnets First (Recommended)

```bash
cd contracts

# Deploy to Arbitrum Sepolia (testnet)
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify

# Deploy to Ethereum Sepolia
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $ETH_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify
```

#### Step 1.2: Deploy to Mainnets

```bash
# Deploy to Arbitrum Nova
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

# Deploy to Arbitrum One
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

# Deploy to Ethereum
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $ETHEREUM_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# Deploy to Gnosis
forge script script/DeployBridgeV2.s.sol \
  --rpc-url $GNOSIS_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $GNOSISSCAN_API_KEY
```

#### Step 1.3: Note Deployed Addresses

After deployment, note the BridgeV2 proxy addresses for each chain:
- Nova: `0x...`
- Arbitrum One: `0x...`
- Ethereum: `0x...`
- Gnosis: `0x...`

---

### Phase 2: Configure Relayer (VPS #1)

#### Step 2.1: SSH into VPS #1

```bash
ssh user@your-vps-1-ip
```

#### Step 2.2: Install Dependencies

```bash
# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone/copy the relayer code
cd /opt
git clone <your-moonbridge-repo> moonbridge
cd moonbridge/relayer
npm install
```

#### Step 2.3: Configure Environment

```bash
cd /opt/moonbridge/relayer
cp .env.example .env
nano .env
```

Update `.env` with:
```env
# Relayer private key (needs gas on all 4 chains)
RELAYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# RPC URLs
ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

# BridgeV2 addresses from deployment
BRIDGE_NOVA_ADDRESS=0x...
BRIDGE_ONE_ADDRESS=0x...
BRIDGE_ETHEREUM_ADDRESS=0x...
BRIDGE_GNOSIS_ADDRESS=0x...

# Optional
POLL_INTERVAL_MS=5000
MAX_RETRIES=3
RETRY_DELAY_MS=10000
GAS_MULTIPLIER=1.2
```

#### Step 2.4: Fund Relayer Wallet

Send ETH to your relayer address on all 4 chains:
- Arbitrum Nova: ~0.1 ETH
- Arbitrum One: ~0.1 ETH
- Ethereum: ~1 ETH (higher gas)
- Gnosis: ~0.5 xDAI

#### Step 2.5: Start Relayer with PM2

```bash
cd /opt/moonbridge/relayer

# Start relayer
pm2 start src/index.js --name moonbridge-relayer

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### Step 2.6: Monitor Relayer

```bash
# View logs
pm2 logs moonbridge-relayer

# Check status
pm2 status

# Restart if needed
pm2 restart moonbridge-relayer
```

---

### Phase 3: Deploy Frontend to Vercel

#### Step 3.1: Update Frontend Configuration

Update bridge addresses in the frontend config:

```bash
cd frontend/src/config
nano index.ts
```

Update `BRIDGE_ADDRESSES`:
```typescript
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0xYOUR_NOVA_ADDRESS' as Address,
  [CHAIN_IDS.ARBITRUM_ONE]: '0xYOUR_ONE_ADDRESS' as Address,
  [CHAIN_IDS.ETHEREUM]: '0xYOUR_ETH_ADDRESS' as Address,
  [CHAIN_IDS.GNOSIS]: '0xYOUR_GNOSIS_ADDRESS' as Address,
} as const;
```

#### Step 3.2: Test Locally

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` and verify:
- Asset selector shows MOON, ETH, USDC, DONUT
- Chain selector shows all 4 chains
- LP interface is visible

#### Step 3.3: Deploy to Vercel

##### Option A: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
cd frontend
vercel --prod
```

##### Option B: Via Vercel Dashboard

1. Go to https://vercel.com
2. Import your GitHub repository
3. Configure:
   - Framework: Next.js
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `.next`
4. Set custom domain: `moonbridge.cc`
5. Deploy

#### Step 3.4: Configure Custom Domain

In Vercel dashboard:
1. Go to Settings → Domains
2. Add `moonbridge.cc`
3. Update DNS records:
   - Type: `A` → Value: `76.76.21.21` (Vercel IP)
   - Type: `CNAME` → Value: `cname.vercel-dns.com`

---

### Phase 4: Seed Initial Liquidity (Optional)

If you want to provide initial liquidity as the DAO:

```bash
# On each chain, deposit liquidity for each asset
# Example for MOON on Nova:

cast send <BRIDGE_NOVA_ADDRESS> \
  "deposit(bytes32,uint256)" \
  $(cast --from-utf8 "MOON" | cast --to-bytes32) \
  1000000000000000000000 \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --private-key $DAO_PRIVATE_KEY
```

---

## Post-Deployment Checklist

### Contract Verification
- [ ] All 4 bridge contracts verified on block explorers
- [ ] LP tokens deployed and verified
- [ ] All routes enabled (test via contract calls)

### Relayer Health
- [ ] Relayer running on VPS #1
- [ ] Logs show "Relayer running on 4 chains"
- [ ] Balance checks pass on all chains
- [ ] PM2 shows process as "online"

### Frontend Testing
- [ ] Website accessible at moonbridge.cc
- [ ] Wallet connects properly
- [ ] Asset selector works (4 assets)
- [ ] Chain selector works (4 chains)
- [ ] Can approve tokens
- [ ] Can initiate bridge
- [ ] LP deposit/withdraw UI functional

### Functionality Testing
- [ ] Bridge MOON from Nova → Arbitrum One
- [ ] Bridge ETH from Ethereum → Nova
- [ ] Bridge USDC from Gnosis → Ethereum
- [ ] Deposit LP liquidity
- [ ] Withdraw LP liquidity
- [ ] Check fees are split correctly (0.8% LP, 0.2% DAO)

---

## Monitoring & Maintenance

### Relayer Monitoring

```bash
# SSH into VPS #1
ssh user@vps-1-ip

# Check logs
pm2 logs moonbridge-relayer

# Check status
pm2 status

# Monitor resource usage
pm2 monit
```

### Key Metrics to Monitor
- Relayer balance on all 4 chains (should auto-alert if low)
- Bridge request/fulfillment rate
- Failed transactions
- Liquidity levels per asset per chain

### Alerts Setup (Recommended)

Use PM2 Plus or custom monitoring:

```bash
# Install PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Troubleshooting

### Relayer Issues

**Problem:** Relayer not detecting events
```bash
# Check RPC URLs are correct
pm2 logs moonbridge-relayer | grep "error"

# Restart relayer
pm2 restart moonbridge-relayer
```

**Problem:** Insufficient gas
```bash
# Check balances
cast balance <RELAYER_ADDRESS> --rpc-url $ARBITRUM_NOVA_RPC_URL
cast balance <RELAYER_ADDRESS> --rpc-url $ETHEREUM_RPC_URL

# Fund if needed
```

### Frontend Issues

**Problem:** Contract not found
- Verify bridge addresses in `frontend/src/config/index.ts`
- Check wallet is on correct chain

**Problem:** Transaction failing
- Check asset is available on selected chain
- Verify sufficient balance
- Check allowance is set

---

## VPS Setup Details

### VPS #1 - Relayer
**Requirements:**
- CPU: 2 cores minimum
- RAM: 4GB minimum
- Storage: 20GB SSD
- OS: Ubuntu 20.04 or later
- Network: Stable connection, low latency

**Security:**
- Enable firewall (ufw)
- Disable password authentication
- Use SSH keys only
- Keep system updated
- Monitor for intrusions

### VPS #2 - Optional Backend/API
If you need additional backend services:
- Database for analytics
- API for historical data
- Monitoring dashboard

---

## Upgrade Path (V1 to V2 Migration)

### Step 1: Pause V1
Call `pause()` on V1 bridge contracts

### Step 2: Deploy V2
Follow deployment steps above

### Step 3: Withdraw V1 Liquidity
DAO withdraws all liquidity from V1 contracts

### Step 4: Seed V2
DAO deposits initial liquidity to V2 (optional)

### Step 5: Update Relayer
- Stop V1 relayer
- Deploy V2 relayer with new config
- Start V2 relayer

### Step 6: Update Frontend
- Deploy V2 frontend to Vercel
- Update moonbridge.cc DNS if needed

### Step 7: Announce
- Announce V2 to community
- Update documentation
- Provide migration guide for users

---

## Cost Estimates

### Gas Costs (Per Chain Deployment)
- Arbitrum Nova: ~$5-10
- Arbitrum One: ~$10-20
- Ethereum: ~$200-500 (depending on gas prices)
- Gnosis: ~$1-5

**Total Deployment Cost: ~$220-535**

### Monthly Running Costs
- VPS #1 (Relayer): $10-20/month
- Gas for relayer fulfillments: Variable (depends on volume)
- Vercel Pro (if needed): $20/month

**Estimated Monthly Cost: $30-40 + gas**

---

## Support & Resources

### Documentation
- Solidity Docs: https://docs.soliditylang.org
- Foundry Book: https://book.getfoundry.sh
- Viem Docs: https://viem.sh
- Wagmi Docs: https://wagmi.sh

### Block Explorers
- Arbitrum Nova: https://nova.arbiscan.io
- Arbitrum One: https://arbiscan.io
- Ethereum: https://etherscan.io
- Gnosis: https://gnosisscan.io

### RPC Providers
- Arbitrum: https://arbitrum.io/rpc
- Ethereum: https://eth.llamarpc.com, https://rpc.ankr.com/eth
- Gnosis: https://rpc.gnosischain.com

---

## Emergency Procedures

### If Relayer Goes Down
1. SSH into VPS and restart: `pm2 restart moonbridge-relayer`
2. Check logs for errors: `pm2 logs`
3. If critical, process queued requests manually via contract calls

### If Frontend Goes Down
1. Check Vercel status: https://vercel.com/status
2. Redeploy if needed: `vercel --prod`
3. Users can still interact via block explorers

### If Contract Has Bug
1. Pause contracts immediately (only owner can do this)
2. Deploy fixed version
3. Update relayer and frontend configurations
4. Resume operations

---

## Contact

For deployment issues or questions, refer to:
- MoonBridge GitHub: https://github.com/your-org/moonbridge
- Community Discord: [Your Discord Link]
- Email: support@moonbridge.cc
