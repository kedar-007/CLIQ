output "eks_cluster_endpoint" {
  description = "Endpoint URL for the EKS Kubernetes API server"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_certificate_authority" {
  description = "Base64-encoded certificate authority data for the EKS cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL instance"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "Port for the RDS PostgreSQL instance"
  value       = aws_db_instance.main.port
}

output "redis_endpoint" {
  description = "Primary endpoint for the ElastiCache Redis replication group"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Reader endpoint for the ElastiCache Redis replication group"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket used for file storage"
  value       = aws_s3_bucket.files.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the S3 file storage bucket"
  value       = aws_s3_bucket.files.arn
}

output "ecr_repository_urls" {
  description = "Map of service name to ECR repository URL"
  value = {
    web                 = aws_ecr_repository.services["web"].repository_url
    auth-service        = aws_ecr_repository.services["auth-service"].repository_url
    chat-service        = aws_ecr_repository.services["chat-service"].repository_url
    call-service        = aws_ecr_repository.services["call-service"].repository_url
    notification-service = aws_ecr_repository.services["notification-service"].repository_url
    file-service        = aws_ecr_repository.services["file-service"].repository_url
    search-service      = aws_ecr_repository.services["search-service"].repository_url
    calendar-service    = aws_ecr_repository.services["calendar-service"].repository_url
    task-service        = aws_ecr_repository.services["task-service"].repository_url
    bot-service         = aws_ecr_repository.services["bot-service"].repository_url
    integration-service = aws_ecr_repository.services["integration-service"].repository_url
    ai-service          = aws_ecr_repository.services["ai-service"].repository_url
    analytics-service   = aws_ecr_repository.services["analytics-service"].repository_url
    billing-service     = aws_ecr_repository.services["billing-service"].repository_url
  }
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name for the S3 file CDN"
  value       = aws_cloudfront_distribution.files_cdn.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.files_cdn.id
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  value       = aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "Name servers for the Route53 hosted zone"
  value       = aws_route53_zone.main.name_servers
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}
