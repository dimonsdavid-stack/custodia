import { writeFileSync } from 'node:fs';
const [release, image, target] = process.argv.slice(2);
if (!['stable', 'candidate'].includes(release)) throw new Error('Release must be stable or candidate');
if (!image || !/^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('An immutable lowercase registry image digest is required');
if (!target) throw new Error('Output filename is required');
const name = `custodia-${release}`;
const deployment = {
  apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: 'custodia' },
  spec: {
    replicas: release === 'stable' ? 3 : 1, revisionHistoryLimit: 5,
    selector: { matchLabels: { app: 'custodia', release } },
    strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } },
    progressDeadlineSeconds: 300,
    template: {
      metadata: { labels: { app: 'custodia', release } },
      spec: {
        serviceAccountName: 'custodia', automountServiceAccountToken: false,
        terminationGracePeriodSeconds: 45,
        securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532, fsGroup: 65532, seccompProfile: { type: 'RuntimeDefault' } },
        topologySpreadConstraints: [{ maxSkew: 1, topologyKey: 'topology.kubernetes.io/zone', whenUnsatisfiable: 'ScheduleAnyway', labelSelector: { matchLabels: { app: 'custodia', release } } }],
        containers: [{
          name: 'custodia', image, imagePullPolicy: 'IfNotPresent',
          ports: [{ name: 'http', containerPort: 3000 }],
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
          envFrom: [{ secretRef: { name: 'custodia-runtime' } }],
          env: [{ name: 'CUSTODIA_RELEASE', value: release }, { name: 'NODE_ENV', value: 'production' }, { name: 'PORT', value: '3000' }, { name: 'HOSTNAME', value: '0.0.0.0' }],
          resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '2', memory: '1Gi' } },
          startupProbe: { httpGet: { path: '/api/v1/ready', port: 'http' }, periodSeconds: 5, failureThreshold: 36 },
          readinessProbe: { httpGet: { path: '/api/v1/ready', port: 'http' }, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 2 },
          livenessProbe: { tcpSocket: { port: 'http' }, initialDelaySeconds: 20, periodSeconds: 15 },
          volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }, { name: 'next-cache', mountPath: '/app/.next/cache' }, { name: 'attestation', mountPath: '/run/custodia', readOnly: true }]
        }],
        volumes: [{ name: 'tmp', emptyDir: { sizeLimit: '64Mi' } }, { name: 'next-cache', emptyDir: { sizeLimit: '128Mi' } }, { name: 'attestation', secret: { secretName: 'custodia-attestation', defaultMode: 288 } }]
      }
    }
  }
};
writeFileSync(target, JSON.stringify(deployment, null, 2) + '\n');
