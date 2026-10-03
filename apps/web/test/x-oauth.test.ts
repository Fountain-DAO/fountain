import { describe, expect, it } from 'vitest';
import { percentEncode, sign } from '../app/.server/x-oauth';

describe('OAuth 1.0a signing', () => {
  it("matches the worked example in X's signature documentation", async () => {
    const signature = await sign(
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json',
      {
        status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
        include_entities: 'true',
        oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
        oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1318622958',
        oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        oauth_version: '1.0',
      },
      'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    );
    expect(signature).toBe('hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
  });

  it('percent-encodes the characters encodeURIComponent leaves alone', () => {
    expect(percentEncode("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
    expect(percentEncode('Ladies + Gentlemen')).toBe('Ladies%20%2B%20Gentlemen');
  });
});
