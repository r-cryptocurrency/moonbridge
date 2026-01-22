# MoonBridge User Guide

A simple guide to bridging your tokens across chains using MoonBridge.

## What is MoonBridge?

MoonBridge is a cross-chain bridge that lets you transfer tokens between:
- **Arbitrum Nova**
- **Arbitrum One**
- **Ethereum Mainnet**
- **Gnosis Chain**

Visit the bridge at: **https://moonbridge.cc**

## Supported Tokens

- **MOON** - r/CryptoCurrency's community token
- **ETH** - Native Ethereum / Wrapped ETH
- **USDC** - USD Coin stablecoin
- **DONUT** - r/EthTrader's community token

## How to Bridge Tokens

### Step 1: Connect Your Wallet

1. Visit https://moonbridge.cc
2. Click "Connect Wallet" in the top right
3. Select your wallet (MetaMask, Rabby, Rainbow, Coinbase Wallet, etc.)
4. Approve the connection

### Step 2: Select Source and Destination

1. **From**: Select the chain where your tokens currently are
2. **To**: Select the chain where you want to send them
3. **Asset**: Choose which token you want to bridge (MOON, ETH, USDC, or DONUT)

> **Note**: Not all tokens are available on all chains. The dropdown will only show assets available on your selected source chain.

### Step 3: Enter Amount

1. Type the amount you want to bridge
2. Or click your balance to select max
3. You'll see a fee breakdown:
   - **Bridge Fee**: 1% (0.8% to liquidity providers, 0.2% to DAO)
   - **Relayer Fee**: Small ETH fee (~$0.10-0.50) to cover destination gas
   - **You Receive**: Amount after fees

### Step 4: Approve Token (First Time Only)

If this is your first time bridging this token:
1. Click "Approve [TOKEN]"
2. Confirm the approval transaction in your wallet
3. Wait for confirmation (~5-30 seconds)

### Step 5: Bridge

1. Click "Bridge [TOKEN]"
2. Confirm the transaction in your wallet
3. Wait for confirmation (~5-30 seconds on source chain)
4. Your tokens should arrive on the destination chain within 30 seconds

## Fees Explained

**Bridge Fee: 1% of amount**
- 0.8% goes to liquidity providers (people who supply liquidity to make bridges possible)
- 0.2% goes to the DAO treasury

**Relayer Fee: ~0.0001-0.0005 ETH**
- Covers gas costs on the destination chain
- Paid in ETH/xDAI on the source chain
- Varies by destination chain (Ethereum is higher, L2s are cheaper)

**Example**:
- Bridge 100 MOON from Nova → One
- Bridge fee: 1 MOON
- Relayer fee: 0.0001 ETH (~$0.35)
- You receive: 99 MOON on Arbitrum One

## What if There's Not Enough Liquidity?

MoonBridge supports **partial fills**. If there's not enough liquidity:

**Example**:
- You bridge 100 MOON
- Only 50 MOON available
- You receive: 49.5 MOON on destination (1% fee on 50)
- Refund: 49.5 MOON back on source (1% fee on 50)
- Total fees: 1 MOON 

You'll see a warning before bridging if liquidity is insufficient.

## Providing Liquidity

Want to earn fees by providing liquidity?

### How to Deposit Liquidity

1. Go to the **"Provide Liquidity"** tab
2. Select the chain and asset
3. Enter amount to deposit
4. Click "Approve" (first time only)
5. Click "Deposit"
6. You'll receive LP tokens representing your share

### How to Withdraw Liquidity

1. Go to the **"Provide Liquidity"** tab
2. Select the chain and asset
3. Enter amount of LP tokens to withdraw
4. Click "Approve LP Token" (first time only)
5. Click "Withdraw"
6. You'll receive your assets back plus any earned fees

### Earning Fees

- You earn 0.8% of every bridge that uses your liquidity
- Fees accumulate in the pool
- Withdraw anytime to claim your portion

## Transaction Times

- **Source confirmation**: 5-30 seconds
- **Relayer processing**: Instant (automated)
- **Destination delivery**: 5-30 seconds
- **Total time**: Usually under 1 minute

## Supported Networks

| Chain | Network Name | Chain ID | Block Explorer |
|-------|--------------|----------|----------------|
| Arbitrum Nova | Arbitrum Nova | 42170 | https://nova.arbiscan.io |
| Arbitrum One | Arbitrum One | 42161 | https://arbiscan.io |
| Ethereum | Ethereum Mainnet | 1 | https://etherscan.io |
| Gnosis | Gnosis Chain | 100 | https://gnosisscan.io |

## Adding Networks to Your Wallet

If you don't see these networks in your wallet:

**Arbitrum Nova**:
- Network Name: Arbitrum Nova
- RPC URL: https://nova.arbitrum.io/rpc
- Chain ID: 42170
- Currency Symbol: ETH
- Block Explorer: https://nova.arbiscan.io

**Arbitrum One**:
- Network Name: Arbitrum One
- RPC URL: https://arb1.arbitrum.io/rpc
- Chain ID: 42161
- Currency Symbol: ETH
- Block Explorer: https://arbiscan.io

**Gnosis Chain**:
- Network Name: Gnosis
- RPC URL: https://rpc.gnosischain.com
- Chain ID: 100
- Currency Symbol: xDAI
- Block Explorer: https://gnosisscan.io

## Troubleshooting

### "Insufficient liquidity" warning

This means there aren't enough tokens in the liquidity pool on the destination chain. Options:
1. Wait for liquidity to be added
2. Bridge a smaller amount
3. Bridge to a different chain

### Transaction stuck or failed

1. Check block explorer to see transaction status
2. Make sure you have enough ETH/native gas on source chain
3. Try increasing gas limit or gas price
4. Message officers of the CCMOON DAO to troubleshoot.

### Tokens haven't arrived

1. Wait 2-3 minutes (sometimes RPCs are slow)
2. Check the destination chain block explorer using your address
3. Verify you're on the correct network in your wallet
4. Refresh your wallet

### Wallet not connecting

1. Make sure you're on a supported network
2. Try disconnecting and reconnecting
3. Clear browser cache
4. Try a different wallet or browser

## Safety Tips

✅ **DO**:
- Double-check source and destination chains before bridging
- Verify the token and amount are correct
- Keep small amounts of ETH on each chain for gas
- Start with a small test amount first

❌ **DON'T**:
- Rush transactions - review everything carefully
- Bridge more than you're comfortable with at once
- Use the bridge if you don't have gas on the source chain

## Getting Help

- **GitHub**: https://github.com/r-cryptocurrency/moonbridge
- **Reddit**: Modmail in r/CryptoCurrency

## Bridge Statistics

Want to see current liquidity and usage?
- Check the bridge contract on each chain's block explorer
- View liquidity pool balances in the "Provide Liquidity" tab

## Technical Details

For developers and advanced users, see:
- **README.md** - Project overview and architecture
- **SPECIFICATIONS.md** - Technical specifications
- **relayer/README.md** - Relayer documentation

---

**Disclaimer**: Use at your own risk. Always verify transactions and addresses. Bridge fees are non-refundable. Make sure you understand how cross-chain bridges work before using.
