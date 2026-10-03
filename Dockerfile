# ==========================================
# SysLab: Cloud-Ready Multi-Stage Dockerfile
# Optimized for AWS ECS, Google Cloud Run, Kubernetes, Render, Fly.io
# ==========================================

# Step 1: Base Stage
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# Step 2: Dependencies Stage
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production

# Step 3: Production Release Stage
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV STORAGE_DATA_DIR=/app/server/data/storage_nodes

# Security: Create and switch to non-root user
USER node

# Copy dependencies and application files
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public

# Ensure storage directories exist with proper write permissions for node user
USER root
RUN mkdir -p /app/server/data/storage_nodes/node_a \
             /app/server/data/storage_nodes/node_b \
             /app/server/data/storage_nodes/node_c && \
    chown -R node:node /app/server/data
USER node

# Expose server port
EXPOSE 3000

# Cloud Container Health Check Probe
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

# Start server
CMD ["node", "server/index.js"]
