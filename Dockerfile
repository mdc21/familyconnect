# ==============================================================================
# FamilyConnect — Production Dockerfile for Azure Container Apps / Cloud Hosting
# Multi-stage, minimal attack surface, non-root user, health check enabled
# ==============================================================================

FROM node:20-alpine AS dependencies
WORKDIR /app

# Install build dependencies if needed and production modules
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ------------------------------------------------------------------------------
# Final Runtime Container
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl for container health checks
RUN apk add --no-cache curl

# Create non-root user directory ownership
RUN chown -R node:node /app

# Copy production node_modules from builder
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules

# Copy application source, frontend, and database assets
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node frontend/ ./frontend/
COPY --chown=node:node scripts/ ./scripts/

# Switch to unprivileged user (ICRC / OWASP security compliance)
USER node

# Expose default application port
EXPOSE 3000

# Docker healthcheck targeting the lightweight RFC-compliant health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/healthz || exit 1

# Start the FamilyConnect application
CMD ["node", "src/app.js"]
