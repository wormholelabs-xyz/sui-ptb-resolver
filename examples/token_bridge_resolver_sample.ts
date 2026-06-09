import { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';

import { getNetworkConfig, SuiPTBResolver } from '../src';

// Token Bridge Relayer V4 PTB resolver (production, from
// example-permissionless-token-bridge-executor-shim). Its on-chain package
// depends on the sui_ptb_resolver pinned at commit f9d2db6, which emits the
// length-prefixed structured-key encoding this SDK parses.
const TOKEN_BRIDGE_CONFIG = {
  mainnet: {
    stateId: '0x7a013e4ff895bf77d172b183004c844b86e34a5d9c5ee257cc846d26e49f139d',
  },
  testnet: {
    stateId: '',
  },
};

// A Token Bridge transfer-with-payload (TBRv4) VAA already redeemed via the
// production resolver. This resolver validates transfer-with-payload and calls
// complete_transfer_with_payload, so plain transfer VAAs will not resolve.
const SAMPLE_VAA =
  'AQAAAAYNAA3q1unsObjsIThNWBPle6R5y0mMmI6LfgL5HcopYFLHMAd877AwuMlV96wIDYikkvYfr0Tq88w2dESFqG+gGlIAA11SHvOYwftzWBlih8wIzUSsTTOX3FHHnezqmMGN/lbhcZU6TTWBNKhTuJw52u8Z7JzrKF/P6Sen8/muk2Nr/AgBBaKjHipgvpKQyjazmmuPg0MyTPL9Ba7YmOGxpBN0wP+6d1D4KHcrb314ZmJ/BW9SUwu7/dJUKd1BUtdjwlUpdYYACJB0An1sN5sWgF0eEJ8h5tH6ny0qR+hIiN8XsWj2nb0LAh75aeA/GmV3NL1SlM3LQr/9g0B8J0GvxSSCdJgQ/RIBCaFWOx7viIyT5SLLqzDftIcriZqOuYJ+RP5GYr0MuGj1EPHtZTyKcB1hcgr06bAxBgw1m+L1VyoNlwOktQrr/jcBCg6qHxiIoqzse/USRlmaY4wUKexlNy5E0CmP6ivsF1GydJmYHSQ66hklL35+6U3uhpl+a+QZt7BY+SarrsZCQOABC6VAEmRHS9+IWJrXkLfxYnue4sQ7eUY9jGX4mJ4VNekyPwU/YJw+qmckd57g1MqB8iwf1nHJLhKZXJ/25iS6yDYADI1+prJ7QKXpVE/1Y0jxnymAtiW5PiiZGa166gS9y+7PaHQDJzaotvRon2wdP76fxyPMXIWyJb+ji28KxgQxOLwADdYo7yh6aAuSVo63ZTNY4R/KO2BjimwtL1xPHQlwJfcQYZMVIPX1567fu6vrXrxH0fX7pdYMKClsXz8df9KfDdkAD07rsDikiCJOHMHzvqM5HGxS9VMBjJvjZdF2/W5lTt5gJnnBz2dQ5RmRl5DeyUrRj8UF16JmuZ1fpk5sYxioP9cAEFonDH/5/wRPnlTVtw39ysaKVgsd/JKr0Q2H8mXdUsMmQFOY3MGgqjnPJ6cLuOAZM3b/FI8jAnDiNpcYhCYnn5cAETTE23xzV2FnpMaQh9o1PzCHaND0yB+em5qnMRXfuj5cSw/extI5L4Nj4skK4BxH81IvPOjr8RYJJVj8RNPrQpsBEgce4WjJWSdGnvpea2sOKIPcbxv1q2+S5OXfUJTpMcHJa4zO6rbtYnkCR7zCjovjIyYY9iPTmJ25brPzQM08OYkBaiOjTwAAAAAABAAAAAAAAAAAAAAAALb22GqPmHmpyH9kN2jZ78OMHabnAAAAAAAMcygPAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxxScAAAAAAAAAAAAAAAAu0zbnL02sBvRy66/LeCNkXO8CVwABPXf+uBDgsDBQ3nVUWlvB1ExDH/DX0VMwpJjpMhiyCyCABUAAAAAAAAAAAAAAAAlE1FTQP9x3VrwL8G9uWFXBNkVJDV7ZZGpRRlE5gmfxmkSPiKeiaWmWoLD8v1O/cVq4xTj';

async function main() {
  const network = getNetworkConfig('mainnet');
  const client = new SuiClient({ url: network.rpcUrl });
  const { stateId } = TOKEN_BRIDGE_CONFIG.mainnet;

  if (!stateId) {
    throw new Error('State ID not configured');
  }

  // Fetch State object to get package_id and module_name
  const stateObject = await client.getObject({
    id: stateId,
    options: { showContent: true },
  });

  if (!stateObject.data?.content || stateObject.data.content.dataType !== 'moveObject') {
    throw new Error('Invalid State object');
  }

  const fields = stateObject.data.content.fields as Record<string, unknown>;
  const packageId = fields.package_id as string;
  const moduleName = fields.module_name as string;

  if (!packageId || !moduleName) {
    throw new Error('State object missing package_id or module_name');
  }

  const vaaBytes = fromBase64(SAMPLE_VAA);
  const resolver = new SuiPTBResolver({ network, maxIterations: 10 }, client);
  const target = `${packageId}::${moduleName}::resolve_vaa`;
  const result = await resolver.resolveVAA(target, stateId, vaaBytes);

  console.log(JSON.stringify(result.transaction.getData(), null, 2));
}

main().catch((error) => {
  console.error('Error:', error.message);
  if (error && typeof error === 'object' && 'details' in error) {
    console.error('Details:', JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
