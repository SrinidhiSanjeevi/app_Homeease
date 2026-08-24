# ==========================================================
# Stage 1: Build & install production dependencies
# ==========================================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy dependency definition files
COPY package.json package-lock.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# ============================================================
# Stage 2: Production runtime image
# ============================================================
FROM node:22-alpine AS runtime

# Install dumb-init for PID 1 signal handling & wget for health checks
RUN apk add --no-cache dumb-init wget

# Remove npm and npx from production runtime image
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

# Create dedicated non-root user and group
RUN addgroup -g 1001 -S homeease \
    && adduser -S homeease -u 1001 -G homeease

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

# Copy production dependencies and application code with correct ownership
COPY --from=deps --chown=homeease:homeease /app/node_modules ./node_modules
COPY --chown=homeease:homeease . .

# Switch to non-root user
USER homeease

# Expose internal admin-backend port
EXPOSE 5001

# Container healthcheck against admin-backend health endpoint
HEALTHCHECK \
    --interval=15s \
    --timeout=5s \
    --start-period=15s \
    --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5001/api/health || exit 1

# Process supervisor signal forwarding
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]# CI rebuild
