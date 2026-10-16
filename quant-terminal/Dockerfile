# ==========================================
# AlphaForge Quant Terminal: Production Dockerfile
# Optimized for Kubernetes, Docker Compose, AWS ECS, GCP Cloud Run
# ==========================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

USER node

COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public

EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/assets || exit 1

CMD ["node", "server/index.js"]
