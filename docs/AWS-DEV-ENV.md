# AWS Dev Environment Guide

This document describes the AWS services, configuration, and GitHub setup required to deploy the core DSV-CLIQ stack into a shared development environment on AWS.

## Deployment shape

This repo now supports an AWS dev deployment with:

- Terraform for shared infrastructure in `infra/terraform`
- Helm for Kubernetes workloads in `infra/helm`
- GitHub Actions for infra and app delivery in:
  - `.github/workflows/aws-dev-infra.yml`
  - `.github/workflows/aws-dev-deploy.yml`

The recommended dev topology is:

- 1 EKS cluster
- 2 worker nodes
- 1 single-AZ RDS PostgreSQL instance
- 1 single-node ElastiCache Redis
- 1 S3 bucket for avatars and uploads
- 1 ingress controller
- 4 public hosts:
  - `app.dev.example.com`
  - `api.dev.example.com`
  - `chat.dev.example.com`
  - `call.dev.example.com`

## AWS services to create

Create these AWS building blocks for dev:

- IAM OIDC trust for GitHub Actions
- S3 bucket for Terraform state
- DynamoDB table for Terraform state locking
- EKS cluster and node group
- ECR repositories for:
  - `web`
  - `auth-service`
  - `chat-service`
  - `call-service`
  - `notification-service`
  - `file-service`
- RDS PostgreSQL
- ElastiCache Redis
- S3 bucket for application uploads
- ACM certificate for the dev subdomains
- Route 53 hosted zone or delegated subdomain
- Ingress controller inside EKS
- CloudWatch logging

Terraform provisions most of the shared platform resources. You still need to bootstrap the Terraform backend and the GitHub OIDC role before the workflows can run end to end.

## Recommended dev configuration

The repo includes `infra/terraform/dev.tfvars.example` with a lower-cost dev profile:

- `availability_zone_count = 2`
- `single_nat_gateway = true`
- `eks_node_instance_type = "t3.medium"`
- `eks_node_desired_size = 2`
- `rds_instance_class = "db.t3.medium"`
- `rds_multi_az = false`
- `rds_deletion_protection = false`
- `rds_skip_final_snapshot = true`
- `redis_node_type = "cache.t3.micro"`
- `redis_num_cache_clusters = 1`
- `redis_multi_az_enabled = false`
- `redis_automatic_failover_enabled = false`

This keeps dev resilient enough for team testing without paying prod-style Multi-AZ and 3-NAT costs.

## Bootstrap the AWS account

### 1. Create the Terraform backend

Create an S3 bucket for state and a DynamoDB table for locking.

Recommended names:

- S3 bucket: `comms-terraform-state`
- DynamoDB table: `comms-terraform-locks`

DynamoDB table shape:

- Partition key: `LockID`
- Type: `String`
- Billing mode: on-demand

### 2. Create a GitHub Actions deploy role

Create an IAM role that GitHub Actions can assume through OIDC.

Recommended policy scope:

- ECR push/pull
- EKS read/update kubeconfig
- IAM read for cluster access if needed
- S3 and DynamoDB access for Terraform backend
- Full Terraform-managed resource access in the dev account or dev OU

OIDC trust policy should trust:

- provider: `token.actions.githubusercontent.com`
- audience: `sts.amazonaws.com`
- your GitHub repo branch or environment

Recommended subject condition:

- `repo:<your-org>/<your-repo>:ref:refs/heads/main`

For manual workflow dispatches from other branches, widen only if you need it.

### 3. Issue a TLS certificate

Request an ACM certificate that covers:

- `app.dev.example.com`
- `api.dev.example.com`
- `chat.dev.example.com`
- `call.dev.example.com`

If you prefer, use a wildcard like `*.dev.example.com`.

### 4. Install an ingress controller

The Helm chart creates Kubernetes `Ingress` resources. You still need an ingress controller in the cluster.

Recommended:

- AWS Load Balancer Controller for ALB-backed ingress
- or ingress-nginx if that is already your platform standard

For AWS-first dev, ALB is the cleaner option.

## GitHub configuration

### Repository variables

Add these GitHub repository or environment variables:

```text
AWS_REGION=us-east-1
AWS_TF_STATE_BUCKET=comms-terraform-state
AWS_TF_LOCK_TABLE=comms-terraform-locks
AWS_ECR_REGISTRY=<account-id>.dkr.ecr.us-east-1.amazonaws.com
AWS_DEV_CLUSTER_NAME=comms-dev
AWS_DEV_DOMAIN_NAME=dev.example.com
AWS_DEV_WEB_HOST=app.dev.example.com
AWS_DEV_API_HOST=api.dev.example.com
AWS_DEV_CHAT_HOST=chat.dev.example.com
AWS_DEV_CALL_HOST=call.dev.example.com
AWS_DEV_FILES_CDN_HOST=files.dev.example.com
AWS_FILES_BUCKET=<terraform-output-bucket-name>
```

### Repository secrets

Add these GitHub secrets:

```text
AWS_ROLE_TO_ASSUME=arn:aws:iam::<account-id>:role/github-actions-comms-dev
DEV_DB_PASSWORD=<strong-rds-password>
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>
S3_ACCESS_KEY_ID=<if using IAM user credentials>
S3_SECRET_ACCESS_KEY=<if using IAM user credentials>
```

If you switch to IAM roles for service accounts later, the S3 access key secrets can go away.

## Infrastructure rollout

### 1. Run the infra workflow

Use the `AWS Dev Infra` workflow.

First run:

- `action = plan`

After review:

- `action = apply`

This will:

- initialize Terraform with the dev backend key
- plan against `infra/terraform/dev.tfvars.example`
- apply the EKS, RDS, Redis, S3, ECR, and Route 53 resources

### 2. Capture Terraform outputs

After apply, record:

- `eks_cluster_name`
- `ecr_repository_urls`
- `rds_endpoint`
- `redis_endpoint`
- `s3_bucket_name`
- `cloudfront_domain`

Use those values to fill any remaining GitHub variables and secrets.

## Application rollout

### 1. Trigger `AWS Dev Deploy`

The deploy workflow:

- builds Docker images
- pushes them to ECR
- creates or updates the `comms-app-secrets` Kubernetes secret
- runs `helm upgrade --install`
- waits for the core workloads to roll out

### 2. Helm chart expectations

The dev Helm profile in `infra/helm/values-dev.yaml` deploys:

- `web`
- `auth-service`
- `chat-service`
- `call-service`
- `notification-service`
- `file-service`

Non-core services are disabled in dev by default to reduce cost and operational noise.

### 3. DNS records

Point the dev subdomains to the ingress load balancer:

- `app.dev.example.com`
- `api.dev.example.com`
- `chat.dev.example.com`
- `call.dev.example.com`

If you use Route 53 in the same account, create alias records to the load balancer.

## Runtime configuration

### Web app public URLs

The web container is built with these public-facing values:

- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_WS_URL`
- `CALL_SIGNALING_URL`

For dev, the recommended values are:

```text
NEXTAUTH_URL=https://app.dev.example.com
NEXT_PUBLIC_APP_URL=https://app.dev.example.com
NEXT_PUBLIC_WS_URL=wss://chat.dev.example.com
CALL_SIGNALING_URL=https://call.dev.example.com
```

### Internal service URLs

Inside the cluster, the web service talks to these service DNS names:

```text
AUTH_SERVICE_URL=http://auth-service-service:3001
CHAT_SERVICE_URL=http://chat-service-service:3002
CALL_SERVICE_URL=http://call-service-service:3003
NOTIFICATION_SERVICE_URL=http://notification-service-service:3004
FILE_SERVICE_URL=http://file-service-service:3005
```

## Database and schema

For a fresh dev environment, apply Prisma after RDS is ready:

```bash
cd packages/db
pnpm dotenv -e ../../.env prisma db push
pnpm dotenv -e ../../.env prisma generate
```

In AWS CI/CD, run this from a one-off admin task, an SSM session, or a migration job in-cluster.

## Suggested first-day validation

After deployment:

1. Open `https://app.dev.example.com/login`
2. Check health endpoints through the ingress or port-forward:
   - `/auth/health`
   - `/calls/health`
3. Register a tenant and two users
4. Test:
   - direct messaging
   - avatar upload
   - incoming call banner
   - 1:1 audio/video call

## Operational notes

- For WebRTC in AWS, configure TURN for internet-facing reliability. STUN-only is not enough for many office or mobile networks.
- For dev, start with a single TURN deployment or Coturn on ECS/EC2.
- If you need screen share over the public internet, always use HTTPS on the web host.

## Files added for AWS dev

- `infra/terraform/dev.tfvars.example`
- `infra/helm/values-dev.yaml`
- `.github/workflows/aws-dev-infra.yml`
- `.github/workflows/aws-dev-deploy.yml`

## Recommended next steps

1. Add AWS Load Balancer Controller installation manifests or Terraform.
2. Add ExternalDNS if Route 53 management should be automated.
3. Add Coturn for production-grade WebRTC traversal.
4. Move `DATABASE_URL` and JWT secrets into AWS Secrets Manager and mount them through External Secrets.
