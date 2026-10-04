FROM rust:1.85-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends libssl-dev pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY hardware/Cargo.toml ./
COPY hardware/src ./src
RUN cargo build --release
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY workers/redaction/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY workers/redaction/engine.py workers/redaction/enclave.py /app/
COPY hardware/enclave-entrypoint.sh /app/entrypoint.sh
COPY --from=build /build/target/release/custodia-nitro /usr/local/bin/custodia-nitro
USER 65532:65532
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
