# MoonBridge

DAO-owned, liquidity-backed fast bridge for MOON between Arbitrum Nova and Arbitrum One.

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐
│  Arbitrum Nova  │         │  Arbitrum One   │
│                 │         │                 │
│  ┌───────────┐  │         │  ┌───────────┐  │
│  │  Bridge   │  │◄───────►│  │  Bridge   │  │
│  │ Contract  │  │ Relayer │  │ Contract  │  │
│  └───────────┘  │         │  └───────────┘  │
│       ▲         │         │       ▲         │
│       │         │         │       │         │
│  ┌────┴────┐    │         │  ┌────┴────┐    │
│  │  MOON   │    │         │  │  MOON   │    │
│  │ Token   │    │         │  │ Token   │    │
│  └─────────┘    │         │  └─────────┘    │
└─────────────────┘         └─────────────────┘
         ▲                           ▲
         │                           │
         └───────── Frontend ────────┘
                (moonbridge.cc)
```

## Features

- **Fast bridging**: Liquidity-backed for instant transfers
- **Partial fills**: Automatic partial fulfillment with refunds when liquidity is low
- **No caps**: No per-transaction or daily limits
- **DAO-controlled**: Multisig admin for pause, relayer management, fee updates
- **Dual relayer**: Two relayers for redundancy, replay-protection prevents double payouts
- **Transparent fees**: 1% fulfill fee, 1% refund fee (capped at 100 MOON), ETH relayer fee

## Project Structure

```
moonbridge/
├── contracts/           # Solidity contracts (Foundry)
│   ├── src/
│   │   └── Bridge.sol   # Main bridge contract
│   ├── script/
│   │   └── DeployBridge.s.sol
│   ├── test/
│   │   └── Bridge.t.sol
│   └── foundry.toml
├── relayer/             # Node.js relayer service
│   ├── src/
│   │   ├── index.js
│   │   └── config.js
│   └── package.json
└── frontend/            # Next.js web interface
    ├── src/
    │   ├── app/
    │   ├── config/
    │   ├── hooks/
    │   └── components/
    └── package.json
```

## Deployment Guide

### Prerequisites

- Node.js >= 18
- Foundry (forge, cast, anvil)
- Private keys for deployer and relayers
- ETH on both chains for gas

### 1. Deploy Contracts

```bash
cd contracts

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

# Build contracts
forge build

# Set environment variables
export PRIVATE_KEY="0x..."
export MOON_TOKEN="0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0"  # Nova MOON
export MULTISIG="0x..."  # Your multisig address
export RELAYER_FEE_WEI="1000000000000000"  # 0.001 ETH
export RELAYER_1="0x..."
export RELAYER_2="0x..."

# Deploy to Arbitrum Nova
forge script script/DeployBridge.s.sol:DeployBridge \
  --rpc-url https://nova.arbitrum.io/rpc \
  --broadcast \
  --verify

# Save the deployed address, then deploy to Arbitrum One
# Update MOON_TOKEN for One chain
export MOON_TOKEN="0x..."  # One MOON address

forge script script/DeployBridge.s.sol:DeployBridge \
  --rpc-url https://arb1.arbitrum.io/rpc \
  --broadcast \
  --verify
```

### 2. Seed Liquidity

```bash
# Approve and transfer MOON to bridges
# On Nova:
cast send $MOON_TOKEN "approve(address,uint256)" $BRIDGE_NOVA $(cast --to-wei 100000 ether) \
  --rpc-url https://nova.arbitrum.io/rpc \
  --private-key $PRIVATE_KEY

cast send $MOON_TOKEN "transfer(address,uint256)" $BRIDGE_NOVA $(cast --to-wei 100000 ether) \
  --rpc-url https://nova.arbitrum.io/rpc \
  --private-key $PRIVATE_KEY

# Repeat for One chain
```

### 3. Verify Deployment

```bash
# Check bridge configuration
export BRIDGE_ADDRESS="0x..."

forge script script/DeployBridge.s.sol:VerifyDeployment \
  --rpc-url https://nova.arbitrum.io/rpc

# Check liquidity
cast call $BRIDGE_ADDRESS "getAvailableLiquidity()" --rpc-url https://nova.arbitrum.io/rpc
```

### 4. Configure Relayer

```bash
cd relayer

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your values:
# - RELAYER_PRIVATE_KEY
# - ARBITRUM_NOVA_RPC_URL
# - ARBITRUM_ONE_RPC_URL
# - BRIDGE_NOVA_ADDRESS
# - BRIDGE_ONE_ADDRESS
# - MOON_TOKEN_NOVA
# - MOON_TOKEN_ONE
```

### 5. Run Relayer (Two VPS Setup)

**VPS 1:**
```bash
cd relayer
npm start
```

**VPS 2:**
```bash
cd relayer
npm start
```

**Using PM2 for production:**
```bash
npm install -g pm2

# Start relayer
pm2 start src/index.js --name moonbridge-relayer

# Save PM2 config
pm2 save
pm2 startup

# View logs
pm2 logs moonbridge-relayer
```

### 6. Deploy Frontend

```bash
cd frontend

# Install dependencies
npm install

# Update contract addresses in src/config/index.ts

# Build
npm run build

# Deploy to Vercel
npx vercel --prod

# Or deploy to your own server
npm start
```

## Contract Functions

### User Functions

| Function | Description |
|----------|-------------|
| `requestBridge(amount, destChainId, recipient)` | Request a bridge transfer (payable - send ETH fee) |
| `cancelRequest(requestId)` | Cancel pending request (no ETH refund) |

### Relayer Functions

| Function | Description |
|----------|-------------|
| `fulfill(...)` | Fulfill a request on destination chain |
| `refund(requestId, amount)` | Process refund on source chain |
| `markCompleted(requestId)` | Mark full fulfill complete (pays ETH fee) |

### Admin Functions (Multisig only)

| Function | Description |
|----------|-------------|
| `pause()` / `unpause()` | Pause/unpause bridge |
| `setRelayer(address, bool)` | Add/remove relayer |
| `setRelayerFeeWei(uint256)` | Update ETH relayer fee |
| `setMultisig(address)` | Transfer admin to new multisig |
| `withdrawLiquidity(to, amount)` | Withdraw MOON liquidity |
| `withdrawEth(to, amount)` | Emergency ETH withdrawal |

## Fee Structure

| Fee Type | Amount | Applied To |
|----------|--------|------------|
| ETH Relayer Fee | Configurable (e.g., 0.001 ETH) | All requests |
| Fulfill Fee | 1% | Amount fulfilled on destination |
| Refund Fee | 1% (max 100 MOON) | Amount refunded on source |

### Example: Partial Fill

User requests 1000 MOON, destination has 600 MOON liquidity:

- **Fulfilled**: 600 MOON → Fee: 6 MOON → Recipient gets: 594 MOON
- **Refunded**: 400 MOON → Fee: 4 MOON → User gets back: 396 MOON
- **ETH Fee**: 0.001 ETH (paid to relayer)

## Security Considerations

1. **Replay Protection**: Each request has unique ID, tracked on both chains
2. **Pause Switch**: Multisig can pause in emergencies
3. **Relayer Allowlist**: Only authorized relayers can fulfill
4. **Reentrancy Guards**: All state-changing functions protected
5. **Dual Relayer**: Two relayers for redundancy without double-payout risk

## Monitoring

### Key Events to Watch

- `BridgeRequested` - New bridge request created
- `BridgeFulfilled` - Request fulfilled on destination
- `BridgeRefunded` - Refund processed on source
- `RequestCancelled` - User cancelled request
- `PauseChanged` - Bridge paused/unpaused

### Health Checks

```bash
# Check relayer ETH balance
cast balance $RELAYER_ADDRESS --rpc-url https://nova.arbitrum.io/rpc

# Check bridge liquidity
cast call $BRIDGE_ADDRESS "getAvailableLiquidity()" --rpc-url https://nova.arbitrum.io/rpc

# Check if paused
cast call $BRIDGE_ADDRESS "paused()" --rpc-url https://nova.arbitrum.io/rpc
```

## Troubleshooting

### Relayer not processing requests

1. Check relayer ETH balance on both chains
2. Verify bridge addresses in .env
3. Check RPC connection
4. Review relayer logs for errors

### Transaction failing

1. Check if bridge is paused
2. Verify sufficient liquidity
3. Check allowance for MOON token
4. Ensure ETH fee is sufficient

### Frontend not showing data

1. Verify contract addresses in config
2. Check RPC connectivity
3. Ensure wallet is on correct chain

## License

MIT

## Support

For issues, please open a GitHub issue or contact the DAO.
