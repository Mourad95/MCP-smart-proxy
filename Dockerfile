# MCP Smart Proxy - Production Dockerfile
# Multi-stage build for optimized image size

# Stage 1: Builder - Install dependencies and download model
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies for transformers.js
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Download embedding model during build to avoid runtime downloads
RUN node -e "
const { pipeline } = require('@xenova/transformers');
console.log('Downloading embedding model...');
pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  .then(() => console.log('Model downloaded successfully'))
  .catch(err => {
    console.error('Failed to download model:', err);
    process.exit(1);
  });
"

# Build TypeScript
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --production

# Stage 2: Production - Minimal image
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r mcp && useradd -r -g mcp mcp

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/config ./config
COPY --from=builder /app/examples ./examples

# Copy model cache from builder
COPY --from=builder /root/.cache/huggingface/hub /home/mcp/.cache/huggingface/hub

# Create data directory for vector storage
RUN mkdir -p /data && chown -R mcp:mcp /data

# Switch to non-root user
USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node /app/dist/healthcheck.js || exit 1

# Expose port
EXPOSE 3000

# Default command
CMD ["node", "dist/index.js", "start", "--config", "/app/config/default.json"]

# Labels
LABEL maintainer="OpenClaw Community"
LABEL description="MCP Smart Proxy - Intelligent proxy for Model Context Protocol"
LABEL version="1.0.0"