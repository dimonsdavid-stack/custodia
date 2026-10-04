# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY enterprise/package.json enterprise/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
FROM dependencies AS build
COPY enterprise/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=65532:65532 /app/.next/standalone ./
COPY --from=build --chown=65532:65532 /app/.next/static ./.next/static
COPY --from=build --chown=65532:65532 /app/public ./public
USER 65532:65532
EXPOSE 3000
CMD ["server.js"]
