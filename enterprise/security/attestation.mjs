import { createPublicKey, randomBytes, verify, timingSafeEqual } from 'node:crypto';

/** Trusted attestation-service assertions only. Vendor quote verification occurs in the service. */
export class AttestationVerifier {
  constructor({ trustAnchors, issuer, audience, pcrs, maxAgeSeconds = 120, verifyHardwareQuote }) {
    if (!issuer || !audience || !Object.keys(pcrs ?? {}).length || !Object.keys(trustAnchors ?? {}).length) throw new Error('Attestation policy incomplete');
    for (const [index, value] of Object.entries(pcrs)) if (!/^\d+$/.test(index) || !/^[a-f0-9]{96}$/.test(value)) throw new Error('PCR policy requires SHA-384 measurements');
    this.policy = { trustAnchors, issuer, audience, pcrs, maxAgeSeconds };
    this.verifyHardwareQuote = verifyHardwareQuote;
    this.challenges = new Map();
  }
  challenge(now = Date.now()) {
    for (const [nonce, expires] of this.challenges) if (expires < now) this.challenges.delete(nonce);
    if (this.challenges.size >= 1000) throw new Error('Challenge capacity reached');
    const nonce = randomBytes(32).toString('base64url');
    this.challenges.set(nonce, now + this.policy.maxAgeSeconds * 1000);
    return nonce;
  }
  async verify(token, expectedNonce, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 65536) throw new Error('Invalid assertion size');
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Malformed JWS');
    const [header, payload] = parts.slice(0, 2).map(p => JSON.parse(Buffer.from(p, 'base64url').toString('utf8')));
    if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || header.crit || header.jku || header.jwk || header.x5u) throw new Error('Unsupported JWS header');
    const anchor = this.policy.trustAnchors[header.kid];
    if (!anchor || !verify(null, Buffer.from(parts.slice(0, 2).join('.')), createPublicKey(anchor), Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid attestation signature');
    const expiry = this.challenges.get(expectedNonce);
    if (!expiry || expiry < now) throw new Error('Challenge expired or replayed');
    const supplied = Buffer.from(payload.nonce ?? ''); const expected = Buffer.from(expectedNonce);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Nonce mismatch');
    const sec = Math.floor(now / 1000);
    if (payload.iss !== this.policy.issuer || payload.aud !== this.policy.audience || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > sec + 5 || sec - payload.iat > this.policy.maxAgeSeconds || payload.exp <= sec || payload.exp > payload.iat + this.policy.maxAgeSeconds) throw new Error('Assertion claims rejected');
    if (payload.debug !== false) throw new Error('Debug enclave rejected');
    for (const [index, value] of Object.entries(this.policy.pcrs)) if (payload.pcrs?.[index] !== value) throw new Error(`PCR ${index} mismatch`);
    if (typeof this.verifyHardwareQuote !== 'function') throw new Error('Hardware quote verifier unavailable');
    this.challenges.delete(expectedNonce);
    const result = await this.verifyHardwareQuote({ quote: payload.quote, nonce: expectedNonce, pcrs: payload.pcrs });
    if (result?.authentic !== true || result?.nonce !== expectedNonce) throw new Error('Hardware quote authenticity not established');
    return Object.freeze({ verified: true, expiresAt: payload.exp * 1000, measurements: payload.pcrs, subject: payload.sub });
  }
}
