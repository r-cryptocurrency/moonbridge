# MoonBridge V2 Relayer

Enterprise-grade automated relayer for the MoonBridge cross-chain bridge protocol.

## Overview

The MoonBridge V2 Relayer monitors bridge requests across multiple EVM-compatible chains and automatically fulfills them on the destination chain when sufficient liquidity is available. It supports partial fills with automatic refunds when liquidity is insufficient.

## Supported Chains

- **Arbitrum Nova** (Chain ID: 42170)
- **Arbitrum One** (Chain ID: 42161)
- **Ethereum Mainnet** (Chain ID: 1)
- **Gnosis Chain** (Chain ID: 100)

## Features

- ✅ **Multi-chain Support**: Monitors and fulfills bridges across 4 chains
- ✅ **Automatic Fulfillment**: Detects bridge requests and fulfills them instantly
- ✅ **Partial Fill Support**: Handles insufficient liquidity with automatic refunds
- ✅ **Historical Processing**: Scans recent blocks on startup to catch missed requests
- ✅ **Duplicate Prevention**: Tracks processed bridges to prevent double-fulfillment
- ✅ **Error Handling**: Robust error handling with detailed logging
- ✅ **Graceful Shutdown**: Clean shutdown on SIGINT (Ctrl+C)
- ✅ **Enterprise Logging**: Clear, structured console output

## Architecture

### Event Flow

```
User (Source Chain)
    ↓ requestBridge()
Bridge Contract (Source)
    ↓ emit BridgeRequested
Relayer
    ↓ detect event
    ↓ check liquidity
    ↓ fulfillBridge()
Bridge Contract (Destination)
    ↓ emit BridgeFulfilled
User receives tokens
```

### Partial Fill Flow

```
User requests 100 MOON bridge
    ↓
Only 50 MOON liquidity available
    ↓
Relayer fulfills 50 MOON on destination
    ↓
Relayer processes refund of 50 MOON on source
    ↓
User receives 50 MOON on destination + 49.5 MOON refund on source
```

## Configuration

### Environment Variables

Create a `.env` file in the relayer directory:

```bash
# Required: Private key of the relayer account (with 0x prefix)
RELAYER_PRIVATE_KEY=0x...
```

### Chain Configuration

Each chain has specific configuration in `src/index-v2.js`:

```javascript
{
  chain: arbitrum,              // Viem chain object
  name: 'Arbitrum One',        // Display name
  rpc: 'https://...',          // RPC endpoint
  confirmations: 2,            // Required confirmations
  maxHistoricalBlocks: 10000,  // Historical scan depth
}
```

**Note**: Ethereum uses 1,000 block limit due to LlamaRPC restrictions.

## Installation

### Prerequisites

- Node.js 18+ with ES modules support
- PM2 (for production deployment)
- Funded relayer wallet with:
  - Native gas tokens on all chains
  - No token holdings required (uses bridge liquidity)

### Setup

```bash
# Install dependencies
npm install

# Create .env file
echo "RELAYER_PRIVATE_KEY=0x..." > .env

# Test run
npm start

# Production deployment with PM2
pm2 start ecosystem.config.cjs
pm2 save
```

## Usage

### Development

```bash
# Run directly
npm start

# Run with specific Node options
node --trace-warnings src/index-v2.js
```

### Production

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# View logs
pm2 logs moonbridge-relayer

# View status
pm2 status

# Restart
pm2 restart moonbridge-relayer

# Stop
pm2 stop moonbridge-relayer
```

## Monitoring

### Health Checks

The relayer logs the following information:

```
✅ Relayer running!
```

Indicates successful startup and monitoring all chains.

### Bridge Processing

```
📬 Bridge Request Detected
  Bridge ID: 0x...
  Asset: 0x...
  From: Arbitrum One → Arbitrum Nova
  Amount: 0.99 (after fee)
  Recipient: 0x...
  💧 Available liquidity: 5.998
  🚀 Fulfilling 0.99...
  📤 Fulfill TX: 0x...
  ✅ Fulfilled! Block: 84554337
```

### Error Scenarios

```
❌ No liquidity available - cannot fulfill
⚠️  Destination chain 999 not supported by relayer
✅ Already fulfilled (prevents duplicate)
```

## Security

### Best Practices

1. **Private Key Management**
   - Store `RELAYER_PRIVATE_KEY` securely
   - Use a dedicated relayer wallet (not your main wallet)
   - Never commit `.env` file to version control

2. **Wallet Funding**
   - Maintain sufficient gas on all chains
   - Monitor gas balances regularly
   - Set up alerts for low gas

3. **Access Control**
   - Relayer address must be authorized on bridge contracts
   - Verify relayer address matches contract configuration

4. **Monitoring**
   - Check logs regularly for errors
   - Monitor transaction success rates
   - Track gas usage and costs

### Relayer Authorization

The relayer address must be set as the authorized relayer on all bridge contracts:

```solidity
// On each chain's bridge contract
bridge.setRelayer(0x536aFD811809E2Ea5d8A66FF0c42B7a5D9de2093);
```

## Troubleshooting

### Common Issues

#### Relayer Not Fulfilling Bridges

1. **Check relayer is authorized**:
   ```bash
   node check-owner.js
   ```

2. **Check gas balances**:
   ```bash
   # View balances on startup in logs
   pm2 logs moonbridge-relayer --lines 50
   ```

3. **Check for errors**:
   ```bash
   pm2 logs moonbridge-relayer --err --lines 100
   ```

#### "RELAYER_PRIVATE_KEY environment variable required"

- Ensure `.env` file exists in relayer directory
- Verify PM2 is using correct working directory:
  ```bash
  pm2 info moonbridge-relayer | grep cwd
  ```

#### "eth_getLogs range is too large"

- This is expected for Ethereum (LlamaRPC limit)
- Relayer automatically uses 1,000 block limit for Ethereum
- No action required

#### RPC Errors (Gnosis)

- Transient errors from free RPC endpoints
- Relayer has built-in error handling
- No action required unless persistent

### Manual Bridge Fulfillment

If a bridge gets stuck:

```bash
# Create manual fulfill script
node manual-fulfill.js

# Or use existing script
node manual-fulfill-2.js
```

See `manual-fulfill-2.js` for example.

## Development

### Code Structure

```
src/
├── index-v2.js          # Main relayer (production)
├── config.js            # Shared configuration (unused by index-v2)
└── index.js.v1.backup   # Old V1 relayer (archived)

ecosystem.config.cjs     # PM2 configuration
.env                     # Environment variables (not in git)
package.json            # Dependencies
```

### Testing

```bash
# Test on single chain
# Modify CHAINS in index-v2.js to include only one chain

# Test historical processing
# Set maxHistoricalBlocks to smaller value like 100

# Test partial fills
# Drain liquidity on destination chain first
```

## Performance

### Resource Usage

- **Memory**: ~100 MB per instance
- **CPU**: <1% average (spikes during bridge processing)
- **Network**: Minimal (event-driven)

### Throughput

- Handles multiple bridges simultaneously
- Average fulfillment time: 5-30 seconds
- Limited by RPC rate limits and gas prices

## License

MIT

## Support

For issues or questions:
- GitHub: https://github.com/r-cryptocurrency/moonbridge
- Documentation: https://github.com/r-cryptocurrency/moonbridge/tree/main/relayer

## Version History

### V2.0.0 (Current)
- Complete rewrite for V2 bridge contracts
- Support for partial fills with automatic refunds
- Multi-chain support (4 chains)
- Enterprise-grade error handling
- Comprehensive logging
- Per-chain historical block limits
- PM2 ecosystem configuration

### V1.0.0 (Archived)
- Initial release
- Basic bridge fulfillment
- 2-chain support
- No partial fill support
