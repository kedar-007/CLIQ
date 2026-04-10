# AWS Dev Billing Estimate

This document estimates the monthly AWS bill for a shared dev environment for DSV-CLIQ.

Date baseline for public pricing references:

- April 10, 2026
- region: `us-east-1`

## Important pricing note

This estimate is intended for planning, not invoice reconciliation.

I used current official AWS pricing pages for the stable shared components:

- Amazon EKS pricing
- Amazon VPC / NAT Gateway pricing
- Elastic Load Balancing pricing
- Route 53 pricing
- Amazon S3 pricing
- AWS Budgets pricing

For instance-family items like EC2, RDS, and ElastiCache, the numbers below are estimates/inferences for the recommended dev topology in this repo. Use AWS Pricing Calculator before purchase approval.

## Recommended dev topology

This estimate assumes the lower-cost dev profile from `infra/terraform/dev.tfvars.example`:

- 1 EKS cluster control plane
- 2 EKS worker nodes of `t3.medium`
- 1 single NAT gateway
- 1 ALB-backed ingress
- 1 single-AZ `db.t3.medium` PostgreSQL instance
- 1 single-node `cache.t3.micro` Redis
- 50 GB RDS storage
- 50 GB S3 Standard storage
- 1 Route 53 hosted zone
- low-to-moderate developer usage

## Monthly estimate

| Service | Assumption | Estimated monthly cost |
| --- | --- | ---: |
| EKS control plane | 1 cluster | $73 |
| EKS worker nodes | 2 x `t3.medium` | $61 |
| NAT Gateway | 1 gateway, no heavy data processing | $33 |
| Application Load Balancer | 1 ALB, light LCU usage | $18 |
| RDS PostgreSQL | `db.t3.medium`, single-AZ, 50 GB gp3 | $90 |
| ElastiCache Redis | `cache.t3.micro`, 1 node | $14 |
| S3 Standard | 50 GB storage | $2 |
| CloudFront for files | light dev traffic | $3 |
| Route 53 hosted zone | 1 hosted zone | $1 |
| CloudWatch logs/metrics | light dev usage | $10 |
| Data transfer buffer | modest external usage | $15 |
| Total estimated dev spend | shared team environment | **$320/month** |

## Practical range

Use this as the realistic planning range:

- lean dev usage: `$260-$320/month`
- typical shared dev usage: `$320-$420/month`
- noisy dev usage with more traffic/logging: `$420-$550/month`

## What makes the bill jump

These are the fastest cost multipliers:

- using 3 NAT gateways instead of 1
- enabling Multi-AZ RDS for dev
- running Redis with replicas in dev
- increasing EKS node count above 2
- large log retention in CloudWatch
- heavy file transfer through NAT or CloudFront

## Why the repo now uses cheaper dev defaults

The Terraform dev profile intentionally lowers spend by:

- reducing AZ count to 2
- using a single NAT gateway
- disabling RDS Multi-AZ
- disabling Redis Multi-AZ and failover
- turning off non-core services by default in Helm dev values

If you deploy the old prod-like defaults for dev, the bill can easily move into the `$600-$900/month` range.

## Official pricing references

- Amazon EKS pricing: https://aws.amazon.com/eks/pricing/
- Amazon VPC pricing: https://aws.amazon.com/vpc/pricing/
- Elastic Load Balancing pricing: https://aws.amazon.com/elasticloadbalancing/pricing/
- Amazon Route 53 pricing: https://aws.amazon.com/route53/pricing/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/
- AWS Budgets pricing: https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/

## Budget alerts

AWS Budgets monitoring alerts are free to use.

Budget actions are:

- first 2 action-enabled budgets per month: free
- additional action-enabled budgets: charged daily

For this dev environment, create 3 simple alert thresholds.

### Recommended monthly budget

- budget name: `comms-dev-monthly`
- amount: `$350`
- type: cost budget
- period: monthly

### Recommended alerts

- 50% actual spend
- 80% forecasted spend
- 100% forecasted spend

Send all alerts to:

- engineering owner
- finance owner
- shared ops email or Slack integration if available

## How to create budget alerts in the AWS console

1. Open AWS Billing and Cost Management.
2. Go to `Budgets`.
3. Click `Create budget`.
4. Choose `Cost budget`.
5. Set:
   - budget name: `comms-dev-monthly`
   - recurring budget: monthly
   - start month: current month
   - amount: `350`
6. Add notifications:
   - actual cost `50%`
   - forecasted cost `80%`
   - forecasted cost `100%`
7. Add email recipients.
8. Save the budget.

## AWS CLI example for budget alerts

You can also create the budget with AWS CLI after enabling billing permissions for the account.

Example files are included here:

- `infra/aws/budgets/dev-monthly-budget.json`
- `infra/aws/budgets/dev-monthly-notifications.json`

Command pattern:

```bash
aws budgets create-budget \
  --account-id <aws-account-id> \
  --budget file://infra/aws/budgets/dev-monthly-budget.json \
  --notifications-with-subscribers file://infra/aws/budgets/dev-monthly-notifications.json
```

## Recommended budget policy

- soft alert at 50%
- investigation at 80%
- approval required above 100%

For dev, I recommend staying with notification-only budgets first. Add budget actions later after the team is comfortable with the deployment flow.
