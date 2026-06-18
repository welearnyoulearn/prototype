FROM node:20-alpine AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG PGHOST=localhost
ARG PGPORT=5432
ARG PGDATABASE=wlyl
ARG PGUSER=postgres
ARG PGPASSWORD=postgres
ARG JWT_SECRET=build-time-placeholder
ARG APP_URL=http://localhost:3000
ENV PGHOST=$PGHOST \
    PGPORT=$PGPORT \
    PGDATABASE=$PGDATABASE \
    PGUSER=$PGUSER \
    PGPASSWORD=$PGPASSWORD \
    JWT_SECRET=$JWT_SECRET \
    APP_URL=$APP_URL
RUN npm run build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

# --- E2E Test Runner ---
FROM base AS e2e
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx playwright install --with-deps chromium 2>/dev/null || true
CMD ["npx", "playwright", "test"]
