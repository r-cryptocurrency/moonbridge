# MoonBridge

Cross-chain bridge for MOON tokens supporting Arbitrum Nova, Arbitrum One, Ethereum Mainnet, and Gnosis Chain.

**Live at:** [moonbridge.cc](https://moonbridge.cc)

## Overview

MoonBridge V2 is a fast, liquidity-backed bridge protocol that enables instant transfers of MOON tokens across multiple EVM-compatible chains. The bridge uses an automated relayer system to fulfill requests and supports partial fills with automatic refunds when liquidity is limited.

### Key Features

- **Multi-chain Support**: Bridge between 4 chains (Arbitrum Nova, Arbitrum One, Ethereum, Gnosis)
- **Fast Transfers**: Liquidity-backed for instant fulfillment (typically 5-30 seconds)
- **Partial Fills**: Automatically handles insufficient liquidity with partial fills and refunds
- **No Limits**: No per-transaction or daily caps
- **Transparent Fees**: 1% bridge fee, optional refund fee on partial fills
- **Enterprise-grade**: Automated relayer with comprehensive monitoring and error handling

### Supported Chains

| Chain | Chain ID | Bridge Address |
|-------|----------|----------------|
| Arbitrum Nova | 42170 | `0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c` |
| Arbitrum One | 42161 | `0x609B1430b6575590F5C75bcb7db261007d5FED41` |
| Ethereum Mainnet | 1 | `0x609B1430b6575590F5C75bcb7db261007d5FED41` |
| Gnosis Chain | 100 | `0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01` |

## Documentation

- **[User Guide](USER_GUIDE.md)**: Step-by-step instructions for using MoonBridge
- **[Technical Specifications](SPECIFICATIONS.md)**: Complete technical documentation and architecture
- **[Relayer Documentation](relayer/README.md)**: Setup and operation guide for running a relayer

## Quick Start

### For Users

Visit [moonbridge.cc](https://moonbridge.cc) to bridge MOON tokens between supported chains.

1. Connect your wallet
2. Select source and destination chains
3. Enter amount to bridge
4. Approve and confirm transaction
5. Receive tokens on destination chain (5-30 seconds)

See [USER_GUIDE.md](USER_GUIDE.md) for detailed instructions.

### For Developers

```bash
# Clone repository
git clone https://github.com/r-cryptocurrency/moonbridge.git
cd moonbridge

# Install contract dependencies
cd contracts
forge install

# Install relayer dependencies
cd ../relayer
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for complete technical documentation.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│  Source Chain   │         │   Dest Chain    │
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
```

### Bridge Flow

1. **Request**: User calls `requestBridge()` on source chain
2. **Event**: `BridgeRequested` event emitted
3. **Detection**: Relayer detects event and checks destination liquidity
4. **Fulfillment**: Relayer calls `fulfillBridge()` on destination chain
5. **Completion**: User receives tokens on destination chain

For partial fills with insufficient liquidity, the relayer automatically processes a refund on the source chain for the unfulfilled portion.

## Fee Structure

### Normal Bridge (Full Liquidity)

- **Bridge Fee**: 1% of amount
- **Example**: Bridge 100 MOON → 1 MOON fee → Receive 99 MOON

### Partial Fill (Insufficient Liquidity)

- **Bridge Fee**: 1% of fulfilled amount
- **Refund Fee**: 1% of refunded amount (capped at 100 MOON)
- **Example**: Request 100 MOON, only 50 MOON available
  - Receive 49.5 MOON on destination (50 - 1% fee)
  - Refunded 49.5 MOON on source (50 - 1% fee)
  - Total fees: 1 MOON

## Project Structure

```
moonbridge/
├── contracts/           # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── BridgeV2.sol
│   │   ├── interfaces/
│   │   └── libraries/
│   ├── script/          # Deployment scripts
│   └── test/            # Contract tests
├── relayer/             # Automated relayer service
│   ├── src/
│   │   └── index-v2.js  # Main relayer
│   └── README.md        # Relayer documentation
└── frontend/            # Next.js web interface
    ├── src/
    │   ├── app/
    │   ├── config/
    │   ├── hooks/
    │   └── components/
    └── package.json
```

## Security

- **Upgradeable Contracts**: UUPS proxy pattern for contract upgrades
- **Replay Protection**: Unique bridge IDs prevent duplicate fulfillments
- **Pausable**: Admin can pause bridge in emergencies
- **Relayer Authorization**: Only authorized relayers can fulfill requests
- **Reentrancy Guards**: All state-changing functions protected
- **Multi-signature Admin**: Critical functions require multisig approval

## Deployment

### Prerequisites

- Node.js 18+
- Foundry (forge, cast, anvil)
- Private keys for deployer and relayer
- Native gas tokens on all chains

### Contract Deployment

```bash
cd contracts

# Build contracts
forge build

# Deploy to each chain
forge script script/DeployBridge.s.sol:DeployBridge \
  --rpc-url <CHAIN_RPC_URL> \
  --broadcast \
  --verify
```

### Relayer Deployment

```bash
cd relayer

# Create .env file with RELAYER_PRIVATE_KEY
echo "RELAYER_PRIVATE_KEY=0x..." > .env

# Run with PM2
pm2 start ecosystem.config.cjs
pm2 save
```

See [relayer/README.md](relayer/README.md) for detailed setup instructions.

### Frontend Deployment

```bash
cd frontend

# Install dependencies
npm install

# Build
npm run build

# Deploy to Vercel
npx vercel --prod
```

## Monitoring

### Key Events

- `BridgeRequested`: New bridge request created
- `BridgeFulfilled`: Request fulfilled on destination chain
- `PartialFillRefunded`: Refund processed for partial fill
- `BridgeRefunded`: User cancelled request

### Health Checks

The relayer provides comprehensive logging for all bridge operations:

```
✅ Relayer running!
📬 Bridge Request Detected
  Bridge ID: 0x...
  From: Arbitrum One → Arbitrum Nova
  Amount: 0.99 (after fee)
  💧 Available liquidity: 5.998
  🚀 Fulfilling 0.99...
  ✅ Fulfilled! Block: 84554337
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT

## Links

- **Website**: [moonbridge.cc](https://moonbridge.cc)
- **GitHub**: [github.com/r-cryptocurrency/moonbridge](https://github.com/r-cryptocurrency/moonbridge)
- **User Guide**: [USER_GUIDE.md](USER_GUIDE.md)
- **Technical Specs**: [SPECIFICATIONS.md](SPECIFICATIONS.md)

## Support

For issues or questions, please open a GitHub issue.

## Support

For issues, please open a GitHub issue or contact the DAO.
