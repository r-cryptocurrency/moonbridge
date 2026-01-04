import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrum, arbitrumNova } from 'viem/chains';

export const config = getDefaultConfig({
  appName: 'MoonBridge',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'moonbridge',
  chains: [arbitrumNova, arbitrum],
  ssr: true,
});
