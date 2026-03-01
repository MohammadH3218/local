# Multi-stage Dockerfile for HandyCall Backend
# Solves the monorepo + private workspace dependency issues

# =============================================================================
# Stage 1: Build shared package
# =============================================================================
FROM node:20-alpine AS shared-builder

WORKDIR /build

# Copy root tsconfig (needed by shared package)
COPY tsconfig.json ./

# Copy shared package
COPY packages/shared/package*.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Build shared package
WORKDIR /build/packages/shared
RUN for i in 1 2 3; do \
      npm_config_fetch_retries=5 \
      npm_config_fetch_retry_factor=2 \
      npm_config_fetch_retry_mintimeout=10000 \
      npm_config_fetch_retry_maxtimeout=120000 \
      npm_config_fetch_timeout=120000 \
      npm install --no-audit --no-fund && break || (echo "shared npm install retry $i failed" && sleep 5); \
    done
RUN npm run build

# =============================================================================
# Stage 2: Build backend
# =============================================================================
FROM node:20-alpine AS backend-builder

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++
ENV NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /build

# Copy root package.json for workspace context
COPY package*.json ./

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/
COPY packages/backend/tsconfig*.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/
COPY packages/backend/src ./packages/backend/src

# Copy built shared package from previous stage
COPY --from=shared-builder /build/packages/shared ./packages/shared

# Install ALL dependencies (including dev deps for building)
WORKDIR /build/packages/backend
RUN for i in 1 2 3; do \
      npm_config_fetch_retries=5 \
      npm_config_fetch_retry_factor=2 \
      npm_config_fetch_retry_mintimeout=10000 \
      npm_config_fetch_retry_maxtimeout=120000 \
      npm_config_fetch_timeout=120000 \
      npm install --no-audit --no-fund && break || (echo "backend npm install retry $i failed" && sleep 5); \
    done

# Build the backend
RUN npm run build

# =============================================================================
# Stage 3: Production runtime
# =============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY packages/backend/package*.json ./

# Copy built shared package
COPY --from=shared-builder /build/packages/shared ./node_modules/@handycall/shared

# Install ONLY production dependencies
# Use --legacy-peer-deps to avoid conflicts with the local shared package
RUN for i in 1 2 3; do \
      npm_config_fetch_retries=5 \
      npm_config_fetch_retry_factor=2 \
      npm_config_fetch_retry_mintimeout=10000 \
      npm_config_fetch_retry_maxtimeout=120000 \
      npm_config_fetch_timeout=120000 \
      npm install --omit=dev --legacy-peer-deps --no-audit --no-fund && break || (echo "production npm install retry $i failed" && sleep 5); \
    done

# Copy built backend code
COPY --from=backend-builder /build/packages/backend/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port (EB uses PORT env var, default to 8080)
EXPOSE 8080

# Health check - using API prefix (api/v1/health)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/' + (process.env.API_PREFIX || 'api/v1') + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
# Nest build outputs to dist/backend/src/main.js
CMD ["node", "dist/backend/src/main.js"]
