@echo off
echo =========================================
echo Updating MoonBridge Relayer on VPS
echo =========================================
echo.

set VPS_IP=167.88.39.128
set VPS_USER=root
set RELAYER_PATH=/opt/moonbridge/relayer
set LOCAL_RELAYER_PATH=C:\Users\ghama\OneDrive\Desktop\Documents\Crypto\r-cryptocurrency\moonbridge\relayer

echo Step 1: Copying updated config.js...
scp "%LOCAL_RELAYER_PATH%\src\config.js" %VPS_USER%@%VPS_IP%:%RELAYER_PATH%/src/

echo.
echo Step 2: Copying updated index.js...
scp "%LOCAL_RELAYER_PATH%\src\index.js" %VPS_USER%@%VPS_IP%:%RELAYER_PATH%/src/

echo.
echo Step 3: Restarting PM2...
ssh %VPS_USER%@%VPS_IP% "cd %RELAYER_PATH% && pm2 restart moonbridge-relayer"

echo.
echo Step 4: Checking relayer status...
ssh %VPS_USER%@%VPS_IP% "pm2 status moonbridge-relayer"

echo.
echo Step 5: Showing recent logs...
ssh %VPS_USER%@%VPS_IP% "pm2 logs moonbridge-relayer --lines 20 --nostream"

echo.
echo =========================================
echo Relayer update complete!
echo =========================================
echo.
echo To monitor logs in real-time, run:
echo ssh %VPS_USER%@%VPS_IP% "pm2 logs moonbridge-relayer"
pause
