# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

COPY packages/types/package.json ./packages/types/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/events/package.json ./packages/events/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/config/package.json ./packages/config/package.json

COPY services/search-service/package.json ./services/search-service/package.json

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY services/search-service/ ./services/search-service/

RUN pnpm --filter=@comms/types build
RUN pnpm --filter=@comms/logger build
RUN pnpm --filter=@comms/utils build
RUN pnpm --filter=@comms/events build
RUN pnpm --filter=@comms/db build
RUN pnpm --filter=@comms/config build
RUN pnpm --filter=@comms/search-service build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

COPY packages/types/package.json ./packages/types/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/events/package.json ./packages/events/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY services/search-service/package.json ./services/search-service/package.json

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/packages/events/dist ./packages/events/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/services/search-service/dist ./services/search-service/dist

ENV NODE_ENV=production

EXPOSE 3006

CMD ["node", "services/search-service/dist/index.js"]
