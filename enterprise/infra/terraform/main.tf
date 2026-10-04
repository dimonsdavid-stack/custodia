terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {}
}
provider "aws" {
  region = var.primary_region
  default_tags { tags = { Product = "Custodia", Environment = var.environment, ManagedBy = "Terraform" } }
}
provider "aws" {
  alias = "secondary"
  region = var.secondary_region
  default_tags { tags = { Product = "Custodia", Environment = var.environment, ManagedBy = "Terraform" } }
}
resource "aws_kms_key" "ledger" {
  description = "Custodia multi-region application encryption key"
  multi_region = true
  enable_key_rotation = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_replica_key" "ledger" {
  provider = aws.secondary
  description = "Custodia secondary-region encryption replica"
  primary_key_arn = aws_kms_key.ledger.arn
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
module "primary" {
  source = "./modules/region"
  name = "custodia-${var.environment}-primary"
  cidr = "10.40.0.0/16"
  kubernetes_version = var.kubernetes_version
  admin_role_arn = var.admin_role_arn
  instance_types = var.instance_types
  enable_cloudhsm = var.enable_cloudhsm
}
module "secondary" {
  source = "./modules/region"
  providers = { aws = aws.secondary }
  name = "custodia-${var.environment}-secondary"
  cidr = "10.41.0.0/16"
  kubernetes_version = var.kubernetes_version
  admin_role_arn = var.admin_role_arn
  instance_types = var.instance_types
  enable_cloudhsm = var.enable_cloudhsm
}
resource "aws_cloudfront_distribution" "application" {
  enabled = true
  comment = "Custodia regional origin failover"
  origin {
    origin_id = "primary"
    domain_name = var.primary_origin_hostname
    custom_origin_config {
      http_port = 80
      https_port = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols = ["TLSv1.2"]
    }
  }
  origin {
    origin_id = "secondary"
    domain_name = var.secondary_origin_hostname
    custom_origin_config {
      http_port = 80
      https_port = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols = ["TLSv1.2"]
    }
  }
  origin_group {
    origin_id = "regional-failover"
    failover_criteria { status_codes = [500, 502, 503, 504] }
    member { origin_id = "primary" }
    member { origin_id = "secondary" }
  }
  default_cache_behavior {
    target_origin_id = "regional-failover"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods = ["GET", "HEAD"]
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    compress = true
  }
  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}
output "primary_cluster" { value = module.primary.cluster_name }
output "secondary_cluster" { value = module.secondary.cluster_name }
output "primary_vpc" { value = module.primary.vpc_id }
output "secondary_vpc" { value = module.secondary.vpc_id }
output "encryption_key_arn" { value = aws_kms_key.ledger.arn }
output "cdn_hostname" { value = aws_cloudfront_distribution.application.domain_name }
