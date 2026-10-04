terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
  backend "s3" {}
}
provider "aws" { region = var.primary_region }
provider "aws" { alias = "secondary"
  region = var.secondary_region
}
variable "primary_region" { type = string }
variable "secondary_region" { type = string }
variable "environment" { type = string }
variable "foundation_state_bucket" { type = string }
variable "foundation_state_key" { type = string }
variable "foundation_state_region" { type = string }
variable "primary_private_subnet_ids" { type = list(string) }
variable "secondary_private_subnet_ids" { type = list(string) }
variable "primary_node_security_group_id" { type = string }
variable "secondary_node_security_group_id" { type = string }
variable "application_secret_arn" { type = string }
variable "application_secret_kms_key_arn" { type = string }
variable "redis_auth_token" { type = string
  sensitive = true
  validation { condition = length(var.redis_auth_token) >= 32 && length(var.redis_auth_token) <= 128
    error_message = "Redis token must contain 32 to 128 characters."
  }
}
data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = { bucket = var.foundation_state_bucket, key = var.foundation_state_key, region = var.foundation_state_region }
}
resource "aws_kms_key" "data" {
  description = "Custodia primary data encryption"
  multi_region = true
  enable_key_rotation = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_replica_key" "data" {
  provider = aws.secondary
  primary_key_arn = aws_kms_key.data.arn
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_security_group" "primary" {
  name_prefix = "custodia-data-"
  vpc_id = data.terraform_remote_state.foundation.outputs.primary_vpc
}
resource "aws_security_group" "secondary" {
  provider = aws.secondary
  name_prefix = "custodia-data-"
  vpc_id = data.terraform_remote_state.foundation.outputs.secondary_vpc
}
resource "aws_vpc_security_group_ingress_rule" "primary" {
  for_each = toset(["5432", "6379"])
  security_group_id = aws_security_group.primary.id
  referenced_security_group_id = var.primary_node_security_group_id
  ip_protocol = "tcp"
  from_port = tonumber(each.key)
  to_port = tonumber(each.key)
}
resource "aws_vpc_security_group_ingress_rule" "secondary" {
  provider = aws.secondary
  for_each = toset(["5432", "6379"])
  security_group_id = aws_security_group.secondary.id
  referenced_security_group_id = var.secondary_node_security_group_id
  ip_protocol = "tcp"
  from_port = tonumber(each.key)
  to_port = tonumber(each.key)
}
resource "aws_db_subnet_group" "primary" {
  name = "custodia-${var.environment}-primary"
  subnet_ids = var.primary_private_subnet_ids
}
resource "aws_db_subnet_group" "secondary" {
  provider = aws.secondary
  name = "custodia-${var.environment}-secondary"
  subnet_ids = var.secondary_private_subnet_ids
}
resource "aws_db_parameter_group" "postgres" {
  family = "postgres16"
  name_prefix = "custodia-pg16-"
  parameter { name = "rds.force_ssl"
    value = "1"
  }
  parameter { name = "log_min_duration_statement"
    value = "500"
  }
}
resource "aws_db_instance" "primary" {
  identifier = "custodia-${var.environment}"
  engine = "postgres"
  engine_version = "16"
  instance_class = "db.m7g.large"
  allocated_storage = 100
  max_allocated_storage = 1000
  storage_type = "gp3"
  storage_encrypted = true
  kms_key_id = aws_kms_key.data.arn
  db_name = "custodia"
  username = "custodia_admin"
  manage_master_user_password = true
  master_user_secret_kms_key_id = aws_kms_key.data.arn
  db_subnet_group_name = aws_db_subnet_group.primary.name
  vpc_security_group_ids = [aws_security_group.primary.id]
  parameter_group_name = aws_db_parameter_group.postgres.name
  multi_az = true
  publicly_accessible = false
  backup_retention_period = 35
  backup_window = "03:00-04:00"
  maintenance_window = "sun:05:00-sun:06:00"
  copy_tags_to_snapshot = true
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "custodia-${var.environment}-final"
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  auto_minor_version_upgrade = true
  lifecycle { prevent_destroy = true }
}
resource "aws_db_instance" "replica" {
  provider = aws.secondary
  identifier = "custodia-${var.environment}-replica"
  replicate_source_db = aws_db_instance.primary.arn
  instance_class = "db.m7g.large"
  storage_encrypted = true
  kms_key_id = aws_kms_replica_key.data.arn
  db_subnet_group_name = aws_db_subnet_group.secondary.name
  vpc_security_group_ids = [aws_security_group.secondary.id]
  multi_az = true
  publicly_accessible = false
  backup_retention_period = 7
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "custodia-${var.environment}-replica-final"
  lifecycle { prevent_destroy = true }
}
resource "aws_elasticache_subnet_group" "redis" {
  name = "custodia-${var.environment}"
  subnet_ids = var.primary_private_subnet_ids
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "custodia-${var.environment}"
  description = "Custodia bounded coordination cache"
  engine = "redis"
  engine_version = "7.1"
  node_type = "cache.r7g.large"
  num_cache_clusters = 3
  automatic_failover_enabled = true
  multi_az_enabled = true
  subnet_group_name = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.primary.id]
  at_rest_encryption_enabled = true
  kms_key_id = aws_kms_key.data.arn
  transit_encryption_enabled = true
  auth_token = var.redis_auth_token
  snapshot_retention_limit = 7
  apply_immediately = false
}
resource "aws_iam_role" "external_secrets" {
  name = "custodia-${var.environment}-external-secrets"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "pods.eks.amazonaws.com" }, Action = ["sts:AssumeRole", "sts:TagSession"] }] })
}
resource "aws_iam_role_policy" "external_secrets" {
  role = aws_iam_role.external_secrets.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"], Resource = [var.application_secret_arn] },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [var.application_secret_kms_key_arn], Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.primary_region}.amazonaws.com" } } }
  ] })
}
resource "aws_eks_pod_identity_association" "secrets" {
  cluster_name = data.terraform_remote_state.foundation.outputs.primary_cluster
  namespace = "external-secrets"
  service_account = "external-secrets"
  role_arn = aws_iam_role.external_secrets.arn
}
output "postgres_writer" { value = aws_db_instance.primary.address }
output "postgres_replica" { value = aws_db_instance.replica.address }
output "postgres_admin_secret_arn" { value = aws_db_instance.primary.master_user_secret[0].secret_arn }
output "redis_writer" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
