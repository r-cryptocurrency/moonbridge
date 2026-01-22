import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrum, arbitrumNova, mainnet, gnosis } from 'viem/chains';

export const config = getDefaultConfig({
  appName: 'MoonBridge',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'moonbridge',
  chains: [arbitrumNova, arbitrum, mainnet, gnosis],
  ssr: true,
});
