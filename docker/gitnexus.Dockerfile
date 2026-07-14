FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# GitNexus core does not require the optional local embedding model. Skipping
# install scripts keeps this image deterministic and small enough for MCP use.
RUN npm install --global gitnexus@1.6.3 --ignore-scripts

WORKDIR /workspace
ENTRYPOINT ["gitnexus"]
