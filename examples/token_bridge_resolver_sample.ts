import { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';

import { getNetworkConfig, SuiPTBResolver } from '../src';

const TOKEN_BRIDGE_CONFIG = {
  mainnet: {
    stateId: '0xc44404d81c3dde6c469bfb9af4ee7df52939c9a4b54d0f15dc1a3356bea2f69c',
  },
  testnet: {
    stateId: '',
  },
};

const SAMPLE_VAA =
  'AQAAAAQNANHXmMu5jxN6Fvx/VQK2whnAT1t+zZ//EDxdyTnKuhRgNh1D4wuMc21iTG1D0bFtnykocbAlRNoKAU4DG0+wM5oBAUWhhJ+7CAQayIk/cZ23txegQ+6CxOZ0BdNRd22DSFjDSyH7yvcma9tWqndacTJRXoF2D0VxOnh9LLR5CZtCJUkBAqATishYtcXzXMIePrvGzUtMqsHbRIsOMTineSxiEOXAGkBXerZwWJZjaL1dV+PNxN430HOTRrnaHjCLxDDMFVEAA2jC0pPiCMc8AuLxSOTQOPkQeZBNh54XrZnDOJbN9/bzGs07F6wcA9ZAzMN3ATb2HW8bmK0c6zFT3zTZFO82TUkABWF44n6+EDl2SxmYRJ4Wwcs45RNcVzctMCYbGRYsPxb5I3/5Yof1i7tp+TIN03Rv3Dddzr/2ErlNgnYSPcFBB0cAB7RihhV0YvzYFf+Ugzl6D4azLsa5nq92bnmUTXkZNcpZUMMzPFvRLHcwGVrK16KPeO7HBStN5KEDhshGRfTTxfwACMLRTjzlicXwzzXVO/iqlFccZVsAFq34QDPxy+s2IzlreHDmw7Fl4OwHi8EnS9XHamg+P4BJKTuUdAbcH0DlSdcACe3wPk9GJfehqTtpFKkDoW7FQWNwPTDvZJ6tPYnWR7iNGikCCJUUCRtMwHUJLOOdPaoXqnzdYYKxhsdJ0KfGHXQACiJKcpTj0rELOQnBpo7IdjPC8tl+dw8CDN1EBGgFCbqAVccipi2/H8t7AFiFCrA74RKzXy9hTxNw7TaCDrJHR0kADohTKcsk9ILS3KYQwiSQ8lq9INVpwod9+kUStdF5QRRnLbidFesLW8fz6yFho3PYNzJ5GyydRO0UPNhL46lN4EsBDwgyl5oXtYGMtlv9tZusBE1ctQ5Z+TONfvN1mpGVANaRN+2tWD9ibf9H2uctvN672rcfuV308MM6YOprYMXwHroAEHVMOlFp7zBIYHtVBKUjrwXONYssfVZdxPTtQ4uNGvuAb0mf1BxuGmoYJxE++GPP9XL3QvCt9GhLz7ByfiZsr5UBEd6x/7VwWxJUL9C5xdH1sXIpAhWFIImHe0ne0zZoSKfPV3DvMO2qeAoxHuxX4NYfZnMSqKdWaBbPEO3G56b67aEAaK3IH1QdAAAABAAAAAAAAAAAAAAAALb22GqPmHmpyH9kN2jZ78OMHabnAAAAAAALJusPAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARsiv2wAAAAAAAAAAAAAAAA2sF/lY0u5SOiIGIGmUWXwT2DHscAAvAfkozsTDwxzNXGsT4Gzdhg8fziDkGWDT8du07U7+EDABUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

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
  process.exit(1);
});
