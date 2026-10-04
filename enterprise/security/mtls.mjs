import https from 'node:https';
import { X509Certificate, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';

/** Credential provider must deliver externally issued short-lived identities. No software key generation. */
export class RotatingMtlsClient {
  constructor({ hostname, port = 443, credentialProvider, rotationMarginMs = 60000 }) {
    if (!hostname || typeof credentialProvider !== 'function') throw new Error('mTLS configuration incomplete');
    this.hostname = hostname; this.port = port; this.provider = credentialProvider; this.margin = rotationMarginMs;
  }
  async credentials() {
    if (this.current && this.current.expiresAt - Date.now() > this.margin) return this.current;
    if (!this.rotation) this.rotation = this.rotate().finally(() => { this.rotation = undefined; });
    return this.rotation;
  }
  async rotate() {
    const material = await this.provider();
    if (!material?.key || !material?.cert || !material?.ca || material.hardwareBacked !== true) throw new Error('Verified hardware-backed mTLS credentials required');
    const cert = new X509Certificate(material.cert); const now = Date.now();
    const expiresAt = Date.parse(cert.validTo);
    if (Date.parse(cert.validFrom) > now || expiresAt - now <= this.margin || expiresAt - now > 24 * 3600000) throw new Error('mTLS certificate validity rejected');
    const a = cert.publicKey.export({ type: 'spki', format: 'der' });
    const b = createPublicKey(createPrivateKey(material.key)).export({ type: 'spki', format: 'der' });
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Certificate key mismatch');
    const agent = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 4, timeout: 5000, minVersion: 'TLSv1.3', rejectUnauthorized: true, key: material.key, cert: material.cert, ca: material.ca });
    this.current?.agent.destroy();
    this.current = { agent, expiresAt }; return this.current;
  }
  async probe() {
    const { agent } = await this.credentials();
    return new Promise((resolve, reject) => {
      const request = https.request({ hostname: this.hostname, port: this.port, path: '/healthz', method: 'HEAD', agent, timeout: 5000 }, response => {
        response.resume();
        if (response.statusCode !== 200 || !response.socket.authorized) reject(new Error('Proxy health or TLS authorization failed')); else resolve({ verified: true, expiresAt: this.current.expiresAt });
      });
      request.on('timeout', () => request.destroy(new Error('Proxy timeout'))); request.on('error', reject); request.end();
    });
  }
  close() { this.current?.agent.destroy(); this.current = undefined; }
}
