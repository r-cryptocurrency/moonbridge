# Relayer Update Guide

## What Was Done

✅ **All 4 bridge contracts upgraded successfully:**
- Arbitrum Nova: 0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c (upgraded)
- Arbitrum One: 0x609B1430b6575590F5C75bcb7db261007d5FED41 (upgraded)
- Ethereum: 0x609B1430b6575590F5C75bcb7db261007d5FED41 (upgraded)
- Gnosis: 0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01 (upgraded)

All contracts now support partial fills with automatic refunds!

## Next: Update Relayer on VPS

### Option 1: Use Batch Script (Easiest)

1. Open Command Prompt or Git Bash
2. Run: `cd C:\Users\ghama\OneDrive\Desktop\Documents\Crypto\r-cryptocurrency\moonbridge`
3. Run: `update_relayer.bat`
4. Follow prompts

### Option 2: Manual Update

If the batch script doesn't work, follow these steps:

1. **Connect to VPS** (adjust command with correct SSH details):
   ```bash
   ssh YOUR_VPS_USER@YOUR_VPS_IP
   ```

2. **Stop the relayer**:
   ```bash
   pm2 stop moonbridge-relayer
   ```

3. **Back up current files** (optional but recommended):
   ```bash
   cd /opt/moonbridge/relayer/src
   cp config.js config.js.backup
   cp index.js index.js.backup
   ```

4. **Exit SSH and copy updated files from your local machine**:
   ```bash
   # From your local machine (Git Bash)
   cd C:\Users\ghama\OneDrive\Desktop\Documents\Crypto\r-cryptocurrency\moonbridge\relayer

   # Copy config.js
   scp src/config.js YOUR_VPS_USER@YOUR_VPS_IP:/opt/moonbridge/relayer/src/

   # Copy index.js
   scp src/index.js YOUR_VPS_USER@YOUR_VPS_IP:/opt/moonbridge/relayer/src/
   ```

5. **Reconnect to VPS and restart relayer**:
   ```bash
   ssh YOUR_VPS_USER@YOUR_VPS_IP
   pm2 restart moonbridge-relayer
   ```

6. **Verify it's running**:
   ```bash
   pm2 status
   pm2 logs moonbridge-relayer --lines 50
   ```

### What Changed in the Relayer

The updated relayer now:
- **Supports partial fills**: Fulfills whatever liquidity is available
- **Detects partial fills**: Compares `fulfilledAmount` vs `requestedAmount` in events
- **Automatic refunds**: Calls `processPartialFillRefund()` on source chain when partial fill detected
- **Updated ABIs**: Includes new `PartialFillRefunded` event and `processPartialFillRefund()` function

### Verification

After updating, check logs for:
```
Executing fulfillBridge on [Chain]...
  Available Liquidity: X.XX
  Partial fill: X.XX of Y.YY
  Actual fulfilled amount from event: X.XX
Partial fill detected: X.XX of Y.YY
Processing refund on source chain...
ProcessPartialFillRefund TX: 0x...
Partial fill refund processed successfully!
```

## Then: Deploy Frontend

Once relayer is updated, you can deploy the frontend to Vercel:

```bash
cd C:\Users\ghama\OneDrive\Desktop\Documents\Crypto\r-cryptocurrency\moonbridge\frontend
npm run build
# Then deploy to Vercel or run: vercel --prod
```

## Summary

| Component | Status |
|-----------|--------|
| Smart Contracts | ✅ Upgraded on all 4 chains |
| Relayer | ⏳ Needs update on VPS |
| Frontend | ⏳ Ready to build & deploy |

## Need Help?

If you're stuck, provide me with:
1. Your correct SSH command to connect to VPS
2. Whether you use password or SSH key
3. Any error messages you see
