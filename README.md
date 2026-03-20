# DSV-CLIQ — Enterprise Communication Platform

A production-grade, multi-tenant SaaS real-time communication platform combining the best features of Microsoft Teams and Zoho Cliq.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose
- Git

## Quick Start

### 1. Install pnpm (if not installed)
```bash
npm install -g pnpm@8
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your actual API keys
```

### 4. Start infrastructure (Docker)
```bash
docker compose up -d
```

Wait ~60 seconds for Elasticsearch to start. Check status:
```bash
docker compose ps
```

### 5. Generate Prisma client + run migrations
```bash
pnpm db:generate
cd packages/db && pnpm db:migrate
```

### 6. Start all services in development mode
```bash
pnpm dev
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Web App | 3000 | Main Next.js frontend |
| Admin Dashboard | 3100 | Super-admin panel |
| Auth Service | 3001 | Authentication & authorization |
| Chat Service | 3002 | WebSocket messaging |
| Call Service | 3003 | WebRTC/PSTN calls |
| Notification Service | 3004 | Push/email/in-app notifications |
| File Service | 3005 | File upload & storage |
| Search Service | 3006 | Elasticsearch full-text search |
| Calendar Service | 3007 | Meetings & scheduling |
| Task Service | 3008 | Tasks & project management |
| Bot Service | 3009 | Bots & automation |
| Integration Service | 3010 | Third-party integrations |
| AI Service | 3011 | AI features (summaries, transcription) |
| Analytics Service | 3012 | Usage metrics & reports |
| Billing Service | 3013 | Stripe billing |

## Infrastructure (Docker)

| Service | Port | URL |
|---------|------|-----|
| PostgreSQL | 5432 | - |
| Redis | 6379 | - |
| Kafka | 9092 | - |
| Kafka UI | 8080 | http://localhost:8080 |
| Elasticsearch | 9200 | http://localhost:9200 |
| Kibana | 5601 | http://localhost:5601 |
| MinIO | 9000/9001 | http://localhost:9001 |
| LiveKit | 7880 | ws://localhost:7880 |
| MailHog | 1025/8025 | http://localhost:8025 |
| Redis Commander | 8081 | http://localhost:8081 |
| ClamAV | 3310 | - |

## Architecture

This platform uses a microservices architecture with:
- **Turborepo** for monorepo build orchestration
- **pnpm workspaces** for package management
- **PostgreSQL** as primary database with Prisma ORM
- **Redis** for caching, pub/sub, sessions, rate limiting
- **Kafka** for event streaming between services
- **Elasticsearch** for full-text search
- **MinIO** (S3-compatible) for file storage
- **LiveKit** for WebRTC calls
- **Socket.io** for real-time messaging

## Development

### Run a specific service
```bash
cd services/auth-service && pnpm dev
```

### Run database studio
```bash
pnpm db:studio
```

### View logs
```bash
docker compose logs -f postgres
docker compose logs -f kafka
```
