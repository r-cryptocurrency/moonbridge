// Check bridge contract owners
import { createPublicClient, http } from 'viem';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c',
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',
};

const OWNER_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
];

const CHAINS = {
  42170: { chain: arbitrumNova, name: 'Arbitrum Nova', rpc: 'https://nova.arbitrum.io/rpc' },
  42161: { chain: arbitrum, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  1: { chain: mainnet, name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  100: { chain: gnosis, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
};

async function checkOwners() {
  console.log('Checking Bridge Contract Owners...\n');

  for (const [chainIdStr, bridgeAddress] of Object.entries(BRIDGE_ADDRESSES)) {
    const chainId = parseInt(chainIdStr);
    const chainConfig = CHAINS[chainId];

    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    });

    try {
      const owner = await client.readContract({
        address: bridgeAddress,
        abi: OWNER_ABI,
        functionName: 'owner',
      });

      console.log(`${chainConfig.name}:`);
      console.log(`  Bridge: ${bridgeAddress}`);
      console.log(`  Owner: ${owner}\n`);
    } catch (error) {
      console.log(`${chainConfig.name}: Error - ${error.message}\n`);
    }
  }
}

checkOwners().catch(console.error);
