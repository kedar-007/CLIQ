# Stage 1: Install dependencies
FROM node:20-alpine AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy package manifests for shared packages
COPY packages/types/package.json ./packages/types/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/events/package.json ./packages/events/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/ui/package.json ./packages/ui/package.json

# Copy web app package manifest
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/packages/utils/node_modules ./packages/utils/node_modules
COPY --from=deps /app/packages/events/node_modules ./packages/events/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

COPY packages/types/ ./packages/types/
COPY packages/logger/ ./packages/logger/
COPY packages/utils/ ./packages/utils/
COPY packages/events/ ./packages/events/
COPY packages/config/ ./packages/config/
COPY packages/ui/ ./packages/ui/
COPY apps/web/ ./apps/web/

# Build shared packages first
RUN pnpm --filter=@comms/types build
RUN pnpm --filter=@comms/logger build
RUN pnpm --filter=@comms/utils build
RUN pnpm --filter=@comms/events build
RUN pnpm --filter=@comms/config build
RUN pnpm --filter=@comms/ui build

# Build Next.js app with standalone output
ARG NEXTAUTH_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_WS_URL
ARG CALL_SIGNALING_URL
ARG AUTH_SERVICE_URL
ARG CHAT_SERVICE_URL
ARG CALL_SERVICE_URL
ARG NOTIFICATION_SERVICE_URL
ARG FILE_SERVICE_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV CALL_SIGNALING_URL=$CALL_SIGNALING_URL
ENV AUTH_SERVICE_URL=$AUTH_SERVICE_URL
ENV CHAT_SERVICE_URL=$CHAT_SERVICE_URL
ENV CALL_SERVICE_URL=$CALL_SERVICE_URL
ENV NOTIFICATION_SERVICE_URL=$NOTIFICATION_SERVICE_URL
ENV FILE_SERVICE_URL=$FILE_SERVICE_URL
RUN pnpm --filter=@comms/web build

# Stage 3: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
