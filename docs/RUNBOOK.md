# DSV-CLIQ Runbook
Start command - cd /Users/kedar/Documents/DSV-CLIQ && docker compose up -d postgres redis minio minio-setup mailhog clamav redis-commander caddy && cd packages/db && pnpm dotenv -e ../../.env prisma db push --accept-data-loss && pnpm dotenv -e ../../.env prisma generate && cd ../.. && pnpm dev:https

Stop Command - cd /Users/kedar/Documents/DSV-CLIQ && pnpm stop:dev

## Local prerequisites

- Node.js 20+
- `pnpm` 8+
- Docker Desktop running
000
## First-time local setup

From the repo root:

```bash
pnpm install
docker compose up -d postgres redis minio minio-setup mailhog clamav redis-commander
cd packages/db
pnpm dotenv -e ../../.env prisma db push --accept-data-loss
pnpm dotenv -e ../../.env prisma generate
cd ../..
```

## Start the project on your LAN

This starts the core collaboration stack only:

- web
- auth-service
- chat-service
- call-service
- notification-service
- file-service

Command:

```bash
pnpm dev:lan
```

The script auto-detects your LAN IP and prints a shareable URL like:

```text
http://192.168.x.x:3000
```

## Stop the project

From the repo root:

```bash
pnpm stop:dev
```

This kills the common dev ports and stops Docker Compose services.

## Core health checks

Run these in another terminal:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
```

Expected: each should return a healthy JSON response.

## Common local issues

### Web app shows `ECONNREFUSED` for `/api/calls/...`

That means `call-service` is not running on port `3003`.

Check it directly:

```bash
curl http://localhost:3003/health
```

If it fails, restart the LAN stack:

```bash
pnpm stop:dev
pnpm dev:lan
```

### Avatar upload does not work

Avatar upload depends on:

- `file-service` on `3005`
- MinIO from Docker Compose

Verify:

```bash
curl http://localhost:3005/health
docker compose ps
```

### Browser camera, mic, or screen share fail on LAN

For `getUserMedia()` and `getDisplayMedia()`, browsers require a secure context.

These work by default on:

- `http://localhost`
- `https://...`

They may fail on:

- `http://192.168.x.x:3000`

For LAN testing without HTTPS, use Chrome with the secure-origin override:

```bash
open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-comms --unsafely-treat-insecure-origin-as-secure=http://YOUR_LAN_IP:3000 --allow-insecure-localhost
```

## AWS deployment overview

The cleanest production layout is:

1. Frontend on ECS Fargate or Amplify
2. Backend services on ECS Fargate
3. PostgreSQL on Amazon RDS
4. Redis on ElastiCache
5. Object storage on S3
6. TLS and routing through an Application Load Balancer
7. DNS via Route 53

## AWS services to create

- VPC with public and private subnets
- ECS cluster
- ECR repositories for:
  - web
  - auth-service
  - chat-service
  - call-service
  - notification-service
  - file-service
- RDS PostgreSQL
- ElastiCache Redis
- S3 bucket for uploads and avatars
- ACM certificate
- Application Load Balancer
- Route 53 hosted zone and DNS records
- CloudWatch log groups

## Recommended production shape

### Frontend

- Deploy `apps/web` behind HTTPS
- Set environment variables for backend service URLs to internal DNS or ALB routes

### Backend

- Containerize each service
- Run services as ECS Fargate tasks/services
- Put them in private subnets
- Expose only the frontend or API gateway publicly

### Database

- Use RDS PostgreSQL
- Set `DATABASE_URL` to the RDS connection string

### Redis

- Use ElastiCache Redis
- Set `REDIS_URL`

### File storage

- Replace MinIO dev config with S3 config:
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
- Set `CDN_BASE_URL` to CloudFront or S3 public distribution URL

## Environment variables you will need in AWS

At minimum:

```env
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
AUTH_SERVICE_URL=http://auth-service:3001
CHAT_SERVICE_URL=http://chat-service:3002
CALL_SERVICE_URL=http://call-service:3003
NOTIFICATION_SERVICE_URL=http://notification-service:3004
FILE_SERVICE_URL=http://file-service:3005
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
S3_REGION=ap-south-1
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
CDN_BASE_URL=https://cdn.your-domain.com
```

## Production deployment flow

1. Build Docker images for each service
2. Push images to ECR
3. Create ECS task definitions
4. Create ECS services
5. Attach services to target groups where needed
6. Configure ALB listeners and routing
7. Point Route 53 records to the ALB
8. Run Prisma schema sync against production DB

Example schema push:

```bash
cd packages/db
pnpm dotenv -e ../../.env prisma db push
pnpm dotenv -e ../../.env prisma generate
```

## Suggested production rollout order

1. RDS
2. Redis
3. S3
4. auth-service
5. chat-service
6. call-service
7. notification-service
8. file-service
9. web

## Notes for WebRTC in production

- Use TURN, not STUN-only, for reliable calls across different external networks.
- Keep the web app on HTTPS so camera, mic, and screen sharing work without browser flags.

## AWS docs in this repo

For a concrete shared dev setup, use:

- [AWS Dev Environment](./AWS-DEV-ENV.md)
- [AWS Billing Estimate](./AWS-BILLING.md)

- STUN-only is okay for small internal testing
- for real internet production, add TURN
- do not rely on LAN-only connectivity in AWS
- use HTTPS everywhere

Recommended TURN options:

- Coturn on ECS/EC2
- managed VM with static public IPs

Then set the TURN variables consumed by the call service ICE config.
