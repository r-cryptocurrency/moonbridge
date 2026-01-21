# MoonBridge V2 - Complete Step-by-Step Deployment Guide

**For Beginners - No Assumptions Made**

This guide will walk you through deploying MoonBridge V2 from start to finish. Follow each step exactly as written.

---

## Current Status Check

✅ You are logged into VPS via terminal
✅ Relayer private key is in `.env` file
✅ Relayer wallet has gas on all 4 chains

---

## Overview: What We'll Do

1. **Deploy Smart Contracts** to 4 chains (from your local computer)
2. **Update Relayer Configuration** on VPS
3. **Start the Relayer** on VPS
4. **Update Frontend Configuration** (local computer)
5. **Deploy Frontend** to Vercel
6. **Test the Bridge** end-to-end

**Time Required:** 2-3 hours

---

## Prerequisites Setup

Before we start, we need to set up your local computer (NOT the VPS) for contract deployment.

### Step 0: Install Required Tools on Your Local Computer

**0.1: Install Foundry (for smart contract deployment)**

Open a terminal on your **local computer** (Windows: Git Bash, Mac/Linux: Terminal):

```bash
curl -L https://foundry.paradigm.xyz | bash
```

**Expected Output:**
```
foundryup: installing foundry...
...
foundryup: done!
```

Then run:
```bash
foundryup
```

**Expected Output:**
```
Installing foundry...
...
forge 0.2.0
cast 0.2.0
anvil 0.2.0
```

**Verify Installation:**
```bash
forge --version
```

**Expected Output:**
```
forge 0.2.0 (or similar version number)
```

---

## Part 1: Deploy Smart Contracts (Local Computer)

We'll deploy contracts to all 4 chains. This must be done from your local computer because we'll use Foundry.

### Step 1: Clone Repository to Local Computer

**1.1: Open terminal on local computer and navigate to where you want the code**

```bash
cd ~/Desktop
```

**1.2: Clone the repository**

```bash
git clone https://github.com/r-cryptocurrency/moonbridge.git
cd moonbridge
```

**Expected Output:**
```
Cloning into 'moonbridge'...
...
done.
```

**Verify:**
```bash
ls
```

**Expected Output:**
```
contracts/  frontend/  relayer/  README.md  DEPLOYMENT_GUIDE.md  ...
```

---

### Step 2: Set Up Environment Variables for Contract Deployment

**2.1: Navigate to contracts directory**

```bash
cd contracts
```

**2.2: Create .env file**

```bash
cp .env.example .env
nano .env
```

Or if you prefer a text editor:
```bash
code .env
```

**2.3: Fill in the .env file with these values:**

```bash
# Your deployer wallet private key (needs ETH on all 4 chains)
PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY_HERE

# Owner address (your multisig or admin wallet)
OWNER=0xYOUR_OWNER_ADDRESS_HERE

# DAO wallet address (receives 0.2% fees)
DAO_WALLET=0xYOUR_DAO_WALLET_ADDRESS_HERE

# Relayer address (the wallet you set up on VPS)
RELAYER=0xYOUR_RELAYER_ADDRESS_HERE

# RPC URLs (use these or your own)
ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

# API Keys for contract verification (get from block explorers)
ARBISCAN_API_KEY=YOUR_ARBISCAN_API_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
GNOSISSCAN_API_KEY=YOUR_GNOSISSCAN_API_KEY
```

**How to get API keys:**
- Arbiscan: Go to https://arbiscan.io/myapikey (create free account)
- Etherscan: Go to https://etherscan.io/myapikey (create free account)
- GnosisScan: Go to https://gnosisscan.io/myapikey (create free account)

**Save and close the file:**
- In nano: Press `Ctrl+X`, then `Y`, then `Enter`
- In VS Code: Press `Ctrl+S` or `Cmd+S`

**2.4: Load environment variables**

```bash
source .env
```

**No output expected - this is normal**

**2.5: Verify environment variables are set**

```bash
echo $OWNER
```

**Expected Output:**
```
0xYourOwnerAddressHere
```

---

### Step 3: Compile Smart Contracts

**3.1: Install dependencies**

```bash
forge install
```

**Expected Output:**
```
Installing dependencies...
...
Installed openzeppelin-contracts
Installed forge-std
```

**3.2: Compile contracts**

```bash
forge build
```

**Expected Output:**
```
[⠊] Compiling...
[⠒] Compiling 50 files with 0.8.20
[⠒] Solc 0.8.20 finished in 3.45s
Compiler run successful!
```

**If you see errors:** Make sure you're in the `contracts/` directory and all dependencies installed correctly.

---

### Step 4: Deploy to Arbitrum Nova

**4.1: Deploy main contracts**

```bash
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

**Expected Output:**
```
[⠊] Compiling...
No files changed, compilation skipped
Script ran successfully.
...
LP Token Implementation deployed: 0x...
LP Token Factory deployed: 0x...
BridgeV2 Implementation deployed: 0x...
BridgeV2 Proxy deployed: 0x...

=================================
Deployment Summary
=================================
...
BridgeV2 Proxy (Use this): 0xABC123... <-- COPY THIS ADDRESS
=================================
```

**IMPORTANT:** Copy the **BridgeV2 Proxy** address. You'll need it for the next steps.

**Expected Time:** 2-3 minutes

**4.2: Save the proxy address**

```bash
export BRIDGE_PROXY=0xYOUR_PROXY_ADDRESS_FROM_STEP_4.1
echo $BRIDGE_PROXY
```

**Expected Output:**
```
0xYourProxyAddress
```

**4.3: Configure assets on Nova**

```bash
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast
```

**Expected Output:**
```
Configuring Arbitrum Nova assets...
...
Assets configured successfully
```

**Expected Time:** 1-2 minutes

**4.4: Configure routes on Nova**

```bash
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --broadcast
```

**Expected Output:**
```
Configuring routes for chain: 42170
...
Routes configured successfully
```

**Expected Time:** 1-2 minutes

**4.5: SAVE THE NOVA PROXY ADDRESS**

Create a file to track all addresses:

```bash
echo "BRIDGE_NOVA_ADDRESS=$BRIDGE_PROXY" >> deployed_addresses.txt
cat deployed_addresses.txt
```

**Expected Output:**
```
BRIDGE_NOVA_ADDRESS=0xYourNovaProxyAddress
```

---

### Step 5: Deploy to Arbitrum One

**5.1: Deploy main contracts**

```bash
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

**Expected Output:**
```
...
BridgeV2 Proxy (Use this): 0xDEF456... <-- COPY THIS ADDRESS
```

**Expected Time:** 2-3 minutes

**5.2: Save proxy address and configure**

```bash
export BRIDGE_PROXY=0xYOUR_ARBITRUM_ONE_PROXY_ADDRESS
echo "BRIDGE_ONE_ADDRESS=$BRIDGE_PROXY" >> deployed_addresses.txt

# Configure assets
forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast

# Configure routes
forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ARBITRUM_ONE_RPC_URL \
  --broadcast
```

**Expected Time:** 4-6 minutes total

---

### Step 6: Deploy to Ethereum

**6.1: Deploy main contracts**

```bash
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Expected Output:**
```
...
BridgeV2 Proxy (Use this): 0xGHI789...
```

**Expected Time:** 3-5 minutes (Ethereum is slower)

**6.2: Save proxy address and configure**

```bash
export BRIDGE_PROXY=0xYOUR_ETHEREUM_PROXY_ADDRESS
echo "BRIDGE_ETHEREUM_ADDRESS=$BRIDGE_PROXY" >> deployed_addresses.txt

forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast

forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $ETHEREUM_RPC_URL \
  --broadcast
```

**Expected Time:** 6-10 minutes total

---

### Step 7: Deploy to Gnosis

**7.1: Deploy main contracts**

```bash
forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $GNOSISSCAN_API_KEY
```

**Expected Output:**
```
...
BridgeV2 Proxy (Use this): 0xJKL012...
```

**Expected Time:** 2-3 minutes

**7.2: Save proxy address and configure**

```bash
export BRIDGE_PROXY=0xYOUR_GNOSIS_PROXY_ADDRESS
echo "BRIDGE_GNOSIS_ADDRESS=$BRIDGE_PROXY" >> deployed_addresses.txt

forge script script/DeployBridgeV2.s.sol:ConfigureAssets \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast

forge script script/DeployBridgeV2.s.sol:ConfigureRoutes \
  --rpc-url $GNOSIS_RPC_URL \
  --broadcast
```

**Expected Time:** 4-6 minutes total

---

### Step 8: View All Deployed Addresses

```bash
cat deployed_addresses.txt
```

**Expected Output:**
```
BRIDGE_NOVA_ADDRESS=0x...
BRIDGE_ONE_ADDRESS=0x...
BRIDGE_ETHEREUM_ADDRESS=0x...
BRIDGE_GNOSIS_ADDRESS=0x...
```

**IMPORTANT:** Keep this file safe. You'll need these addresses for the relayer and frontend.

---

## Part 2: Configure and Start Relayer (VPS)

Now we switch to your VPS terminal where you're already logged in.

### Step 9: Transfer Addresses to VPS

**9.1: On your LOCAL computer, display the addresses**

```bash
cat deployed_addresses.txt
```

**9.2: On your VPS, navigate to relayer directory**

```bash
cd /opt/moonbridge/relayer
```

**If the directory doesn't exist:**
```bash
cd /opt
git clone https://github.com/r-cryptocurrency/moonbridge.git
cd moonbridge/relayer
```

**Expected Output:**
```
(You should now be in /opt/moonbridge/relayer)
```

**9.3: Edit the .env file on VPS**

```bash
nano .env
```

**9.4: Update the bridge addresses in .env**

You should already have `RELAYER_PRIVATE_KEY` set. Now add the bridge addresses:

```bash
# Keep your existing RELAYER_PRIVATE_KEY line
RELAYER_PRIVATE_KEY=0x...

# Add these lines with YOUR deployed addresses
ARBITRUM_NOVA_RPC_URL=https://nova.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

# YOUR DEPLOYED ADDRESSES (from deployed_addresses.txt)
BRIDGE_NOVA_ADDRESS=0xYourNovaAddress
BRIDGE_ONE_ADDRESS=0xYourArbOneAddress
BRIDGE_ETHEREUM_ADDRESS=0xYourEthereumAddress
BRIDGE_GNOSIS_ADDRESS=0xYourGnosisAddress

# Optional configuration
POLL_INTERVAL_MS=5000
MAX_RETRIES=3
RETRY_DELAY_MS=10000
GAS_MULTIPLIER=1.2
```

**Save the file:** Press `Ctrl+X`, then `Y`, then `Enter`

---

### Step 10: Install Relayer Dependencies

**10.1: Install Node.js (if not already installed)**

Check if Node.js is installed:
```bash
node --version
```

**If you see version number (v18.x.x or higher):** Skip to Step 10.2

**If you see "command not found":** Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Expected Output:**
```
...
Node.js 18.x installed successfully
```

**Verify:**
```bash
node --version
npm --version
```

**Expected Output:**
```
v18.19.0 (or similar)
10.2.3 (or similar)
```

**10.2: Install relayer dependencies**

```bash
npm install
```

**Expected Output:**
```
added 234 packages in 15s
```

**Expected Time:** 30-60 seconds

---

### Step 11: Test Relayer Configuration

**11.1: Do a quick syntax check**

```bash
node -c src/index.js
```

**Expected Output:** (no output means success)

**If you see errors:** Check your .env file and make sure all addresses are correct.

---

### Step 12: Install and Configure PM2

**12.1: Install PM2 globally**

```bash
sudo npm install -g pm2
```

**Expected Output:**
```
added 182 packages in 8s
```

**12.2: Verify PM2 installation**

```bash
pm2 --version
```

**Expected Output:**
```
5.3.0 (or similar version)
```

---

### Step 13: Start the Relayer

**13.1: Start relayer with PM2**

```bash
pm2 start src/index.js --name moonbridge-relayer
```

**Expected Output:**
```
[PM2] Starting src/index.js in fork_mode (1 instance)
[PM2] Done.
┌────┬────────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name                   │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ moonbridge-relayer     │ fork     │ 0    │ online    │ 0%       │ 50.0mb   │
└────┴────────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

**Status should show "online" - this is good!**

**13.2: View relayer logs**

```bash
pm2 logs moonbridge-relayer
```

**Expected Output:**
```
0|moonbridge-relayer | Initializing MoonBridge V2 Relayer...
0|moonbridge-relayer | Connecting to Arbitrum Nova...
0|moonbridge-relayer | Connecting to Arbitrum One...
0|moonbridge-relayer | Connecting to Ethereum...
0|moonbridge-relayer | Connecting to Gnosis...
0|moonbridge-relayer | ✓ Relayer running on 4 chains
0|moonbridge-relayer | Watching for bridge requests...
```

**If you see errors:** Press `Ctrl+C` to exit logs, then check:
```bash
pm2 logs moonbridge-relayer --err
```

**13.3: Save PM2 configuration**

```bash
pm2 save
```

**Expected Output:**
```
[PM2] Saving current process list...
[PM2] Successfully saved in ~/.pm2/dump.pm2
```

**13.4: Set PM2 to start on boot**

```bash
pm2 startup
```

**Expected Output:**
```
[PM2] Init System found: systemd
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username
```

**Copy the command it shows and run it.** Example:
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u yourusername --hp /home/yourusername
```

**Expected Output:**
```
[PM2] [v] Command successfully executed.
```

---

### Step 14: Verify Relayer is Running

**14.1: Check PM2 status**

```bash
pm2 status
```

**Expected Output:**
```
┌────┬────────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name                   │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ moonbridge-relayer     │ fork     │ 0    │ online    │ 0%       │ 52.3mb   │
└────┴────────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

**"online" status = SUCCESS! Your relayer is running!**

**14.2: Monitor logs in real-time (optional)**

```bash
pm2 logs moonbridge-relayer --lines 50
```

**Press Ctrl+C to exit when done viewing**

---

## Part 3: Deploy Frontend (Local Computer)

Switch back to your local computer terminal.

### Step 15: Update Frontend Configuration

**15.1: Navigate to frontend directory**

```bash
cd ~/Desktop/moonbridge/frontend
```

**15.2: Install frontend dependencies**

```bash
npm install
```

**Expected Output:**
```
added 1523 packages in 45s
```

**Expected Time:** 1-2 minutes

**15.3: Edit frontend config**

```bash
nano src/config/index.ts
```

Or use your preferred editor:
```bash
code src/config/index.ts
```

**15.4: Find the BRIDGE_ADDRESSES section (around line 76)**

Look for:
```typescript
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0x...' as Address,
  [CHAIN_IDS.ARBITRUM_ONE]: '0x...' as Address,
  [CHAIN_IDS.ETHEREUM]: '0x...' as Address,
  [CHAIN_IDS.GNOSIS]: '0x...' as Address,
} as const;
```

**15.5: Replace with YOUR deployed addresses**

```typescript
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0xYourNovaAddress' as Address,
  [CHAIN_IDS.ARBITRUM_ONE]: '0xYourArbOneAddress' as Address,
  [CHAIN_IDS.ETHEREUM]: '0xYourEthereumAddress' as Address,
  [CHAIN_IDS.GNOSIS]: '0xYourGnosisAddress' as Address,
} as const;
```

**Save the file**

---

### Step 16: Test Frontend Locally

**16.1: Start development server**

```bash
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

**16.2: Open browser and test**

1. Open http://localhost:3000 in your browser
2. You should see the MoonBridge interface
3. Try connecting your wallet (MetaMask)
4. Check if you can see asset balances

**If it works:** Press `Ctrl+C` in terminal to stop the dev server

**If you see errors:** Check the browser console (F12) and terminal for error messages

---

### Step 17: Deploy Frontend to Vercel

**17.1: Install Vercel CLI**

```bash
npm install -g vercel
```

**Expected Output:**
```
added 87 packages in 5s
```

**17.2: Login to Vercel**

```bash
vercel login
```

**Expected Output:**
```
Vercel CLI 32.x.x
> Log in to Vercel
? Email: (enter your email)
```

Enter your email and follow the verification link sent to your email.

**After verification:**
```
> Success! Email verified
```

**17.3: Deploy to Vercel**

```bash
vercel --prod
```

**Expected Questions and Answers:**

```
? Set up and deploy "~/Desktop/moonbridge/frontend"? [Y/n] Y
? Which scope do you want to deploy to? (select your account)
? Link to existing project? [y/N] N
? What's your project's name? moonbridge
? In which directory is your code located? ./
```

**Expected Output:**
```
🔗  Linked to your-username/moonbridge
🔍  Inspect: https://vercel.com/...
✅  Production: https://moonbridge-xxx.vercel.app [copied to clipboard]
```

**Expected Time:** 2-3 minutes

**17.4: Note your deployment URL**

Copy the production URL (e.g., `https://moonbridge-xxx.vercel.app`)

---

### Step 18: Configure Custom Domain (Optional)

If you own moonbridge.cc:

**18.1: Go to Vercel dashboard**
- Visit https://vercel.com/dashboard
- Select your moonbridge project

**18.2: Add domain**
- Click "Settings" → "Domains"
- Add `moonbridge.cc`
- Follow DNS configuration instructions

**18.3: Update DNS**
Add these records at your domain registrar:
- Type: `A` → Value: `76.76.21.21`
- Type: `CNAME` → Name: `www` → Value: `cname.vercel-dns.com`

**Propagation time:** 1-24 hours

---

## Part 4: Testing the Complete System

### Step 19: Prepare Test Wallets

**19.1: Make sure you have test funds**

You'll need on Arbitrum Nova:
- Small amount of ETH (for gas + relayer fee)
- Small amount of MOON (or other asset to bridge)

**19.2: Get MOON token address on Nova:**
`0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0`

---

### Step 20: Test Bridge Transaction

**20.1: Open your frontend URL in browser**
```
https://moonbridge-xxx.vercel.app
(or http://localhost:3000 if still testing locally)
```

**20.2: Connect wallet**
- Click "Connect Wallet"
- Select MetaMask
- Switch to Arbitrum Nova network

**Expected:** Wallet connected, showing your address

**20.3: Select asset to bridge**
- Choose "MOON"
- Enter amount: `1` (1 MOON)

**Expected:** You should see:
- Your MOON balance
- Bridge fee: 0.01 MOON (1%)
- Relayer fee: 0.0001 ETH
- Recipient receives: 0.99 MOON

**20.4: Select destination**
- Choose "Arbitrum One"

**20.5: Approve MOON (first time only)**
- Click "Approve MOON"
- Confirm in MetaMask
- Wait for transaction

**Expected:** Transaction confirmed, approve button changes to "Bridge"

**20.6: Execute bridge**
- Click "Bridge"
- Confirm in MetaMask
- Transaction should show: 1 MOON + 0.0001 ETH total

**Expected:** Transaction sent

**20.7: Wait for fulfillment**
- Should take 10-30 seconds
- Watch the relayer logs on VPS:
  ```bash
  pm2 logs moonbridge-relayer
  ```

**Expected Relayer Logs:**
```
0|moonbridge-relayer | ✓ New bridge request detected
0|moonbridge-relayer | From: Arbitrum Nova
0|moonbridge-relayer | To: Arbitrum One
0|moonbridge-relayer | Asset: MOON
0|moonbridge-relayer | Amount: 0.99 MOON
0|moonbridge-relayer | Checking destination liquidity...
0|moonbridge-relayer | ✓ Fulfilling bridge on Arbitrum One
0|moonbridge-relayer | Tx hash: 0x...
0|moonbridge-relayer | ✓ Bridge fulfilled successfully
```

**20.8: Verify on destination**
- Switch MetaMask to Arbitrum One
- Check MOON balance
- Should increase by 0.99 MOON

**Expected:** Balance increased = SUCCESS! 🎉

---

### Step 21: Monitor Relayer Performance

**21.1: Check relayer status**

```bash
ssh your-vps-ip
pm2 status
```

**Expected:**
```
│ 0  │ moonbridge-relayer     │ fork     │ 0    │ online    │ 0%       │ 52.3mb   │
```

**21.2: Check relayer fee balance (on any chain)**

On your local computer:
```bash
cd ~/Desktop/moonbridge/contracts
cast call 0xYourNovaProxyAddress "relayerFeeBalance()(uint256)" --rpc-url $ARBITRUM_NOVA_RPC_URL
```

**Expected Output:**
```
100000000000000  (this is 0.0001 ETH in wei)
```

This means your relayer has collected fees!

---

## Troubleshooting Guide

### Problem: Contract deployment fails

**Error:** "Insufficient funds"
**Solution:** Make sure deployer wallet has ETH on the chain you're deploying to

**Error:** "Transaction underpriced"
**Solution:** Wait a few seconds and try again, or increase gas price in foundry.toml

### Problem: Relayer shows "offline"

**Check logs:**
```bash
pm2 logs moonbridge-relayer --err
```

**Common issues:**
- RPC URL not accessible: Test with `curl -X POST $ARBITRUM_NOVA_RPC_URL`
- Private key wrong: Double-check .env file
- Bridge addresses wrong: Verify against deployed_addresses.txt

**Solution:** Fix the issue and restart:
```bash
pm2 restart moonbridge-relayer
```

### Problem: Frontend not connecting to wallet

**Check:**
- MetaMask installed?
- Correct network selected?
- Browser console (F12) for errors

**Solution:** Refresh page, disconnect and reconnect wallet

### Problem: Bridge transaction fails

**Check:**
- Sufficient balance? (asset + ETH for gas + relayer fee)
- Asset approved?
- Relayer running and online?

**View transaction on block explorer:**
- Nova: https://nova.arbiscan.io
- Arbitrum One: https://arbiscan.io
- Ethereum: https://etherscan.io
- Gnosis: https://gnosisscan.io

---

## Success Checklist

After completing this guide, you should have:

✅ Smart contracts deployed to 4 chains
✅ Relayer running on VPS (showing "online" in PM2)
✅ Frontend deployed to Vercel
✅ Successfully completed a test bridge transaction
✅ Relayer collected fees (relayerFeeBalance > 0)

---

## Maintenance Commands

### Check relayer status
```bash
ssh your-vps-ip
pm2 status
```

### View relayer logs
```bash
pm2 logs moonbridge-relayer
```

### Restart relayer
```bash
pm2 restart moonbridge-relayer
```

### Claim relayer fees (when balance grows)
```bash
cast send 0xYourProxyAddress "claimRelayerFees()" \
  --rpc-url $ARBITRUM_NOVA_RPC_URL \
  --private-key $RELAYER_PRIVATE_KEY
```

### Update frontend
```bash
cd ~/Desktop/moonbridge/frontend
git pull
npm install
vercel --prod
```

---

## Next Steps

1. **Seed Liquidity (Optional):**
   - Deposit MOON, ETH, USDC, DONUT to pools
   - Receive LP tokens
   - Start earning 0.8% fees

2. **Set Up Monitoring:**
   - Create dashboard for relayer uptime
   - Set up alerts for low gas
   - Monitor relayerFeeBalance

3. **Announce to Community:**
   - Post on r/CryptoCurrency
   - Update documentation with live addresses
   - Create user guide

---

## Support

If you get stuck:

1. **Check logs:** `pm2 logs moonbridge-relayer`
2. **Check transactions:** Block explorer (Arbiscan, Etherscan, etc.)
3. **Review documentation:**
   - [RELAYER_FEE_IMPLEMENTATION.md](./RELAYER_FEE_IMPLEMENTATION.md)
   - [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
   - [SPECIFICATIONS.md](./SPECIFICATIONS.md)

---

**Congratulations! 🎉**

You've successfully deployed MoonBridge V2 with:
- ✅ Multi-chain smart contracts
- ✅ Self-sustaining relayer with fee collection
- ✅ Live frontend
- ✅ End-to-end tested bridge

Your bridge is now operational and the relayer will run forever by collecting fees from users!
