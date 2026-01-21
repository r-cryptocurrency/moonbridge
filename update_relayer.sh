#!/bin/bash
# Script to update relayer on VPS with partial fill support

echo "========================================="
echo "Updating MoonBridge Relayer on VPS"
echo "========================================="

VPS_IP="167.88.39.128"
VPS_USER="root"
RELAYER_PATH="/opt/moonbridge/relayer"

echo ""
echo "Step 1: Copying updated config.js..."
scp src/config.js ${VPS_USER}@${VPS_IP}:${RELAYER_PATH}/src/

echo ""
echo "Step 2: Copying updated index.js..."
scp src/index.js ${VPS_USER}@${VPS_IP}:${RELAYER_PATH}/src/

echo ""
echo "Step 3: Restarting PM2..."
ssh ${VPS_USER}@${VPS_IP} "cd ${RELAYER_PATH} && pm2 restart moonbridge-relayer"

echo ""
echo "Step 4: Checking relayer status..."
ssh ${VPS_USER}@${VPS_IP} "pm2 status moonbridge-relayer"

echo ""
echo "Step 5: Showing recent logs..."
ssh ${VPS_USER}@${VPS_IP} "pm2 logs moonbridge-relayer --lines 20 --nostream"

echo ""
echo "========================================="
echo "Relayer update complete!"
echo "========================================="
echo ""
echo "To monitor logs in real-time, run:"
echo "ssh ${VPS_USER}@${VPS_IP} \"pm2 logs moonbridge-relayer\""
