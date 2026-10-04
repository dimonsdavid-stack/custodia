import { writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
const [hostname, candidateHostname, certificateSecret, sourceRanges, target] = process.argv.slice(2);
const host = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
if (!host.test(hostname ?? '') || !host.test(candidateHostname ?? '') || hostname === candidateHostname) throw new Error('Distinct production and candidate TLS DNS names are required');
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(certificateSecret ?? '') || !target) throw new Error('Existing TLS secret and output path are required');
const ranges = (sourceRanges ?? '').split(',');
for (const range of ranges) {
  const parts = range.split('/');
  const family = isIP(parts[0]);
  const prefix = Number(parts[1]);
  if (parts.length !== 2 || !family || !/^\d+$/.test(parts[1]) || prefix < (family === 4 ? 8 : 32) || prefix > (family === 4 ? 32 : 128)) throw new Error('Explicit limited deployment-runner IPv4/IPv6 CIDRs are required');
}
const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'custodia-candidate', namespace: 'custodia' }, spec: { selector: { app: 'custodia', release: 'candidate' }, ports: [{ port: 80, targetPort: 3000 }] } };
function ingress(domain, candidate) {
  const annotations = { 'nginx.ingress.kubernetes.io/ssl-redirect': 'true', 'nginx.ingress.kubernetes.io/proxy-body-size': '256k', 'nginx.ingress.kubernetes.io/proxy-read-timeout': '15' };
  if (candidate) annotations['nginx.ingress.kubernetes.io/whitelist-source-range'] = ranges.join(',');
  return {
    apiVersion: 'networking.k8s.io/v1', kind: 'Ingress',
    metadata: { name: candidate ? 'custodia-candidate' : 'custodia', namespace: 'custodia', annotations },
    spec: {
      ingressClassName: 'nginx', tls: [{ hosts: [domain], secretName: certificateSecret }],
      rules: [{ host: domain, http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: candidate ? 'custodia-candidate' : 'custodia', port: { number: 80 } } } }] } }]
    }
  };
}
writeFileSync(target, JSON.stringify({ apiVersion: 'v1', kind: 'List', items: [service, ingress(hostname, false), ingress(candidateHostname, true)] }, null, 2) + '\n');
