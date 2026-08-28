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

# ==========================================================
# Stage 2: Production runtime image
# ==========================================================
FROM node:22-alpine AS runtime

# Patch OS-level packages so Trivy doesn't flag known CVEs already
# fixed upstream in Alpine's repos — this is the single highest-value
# line for a clean Trivy HIGH/CRITICAL scan on an Alpine base image.
RUN apk update && apk upgrade --no-cache

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

# Copy production dependencies and application code with correct ownership
COPY --from=deps --chown=homeease:homeease /app/node_modules ./node_modules
COPY --chown=homeease:homeease . .

# Switch to non-root user
USER homeease

# Expose internal backend port
EXPOSE 5000

# Container healthcheck against backend health endpoint
HEALTHCHECK \
    --interval=15s \
    --timeout=5s \
    --start-period=15s \
    --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Process supervisor signal forwarding
ENTRYPOINT ["dumb-init", "--"]

# FIX: the trailing "# CI rebuild" comment was on the SAME line as CMD,
# breaking Docker's JSON-array parsing of the exec form. Docker silently
# fell back to shell form and tried to literally execute the text
# `["node", "server.js"]# CI rebuild` as a shell command — which doesn't
# exist, producing exit code 127 and an endless restart loop under
# docker-compose's `restart: unless-stopped`. The comment must be its
# own line, or removed entirely, never appended after CMD.
CMD ["node", "server.js"]