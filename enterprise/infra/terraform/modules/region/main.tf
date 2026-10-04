terraform {
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
}
variable "name" { type = string }
variable "cidr" { type = string }
variable "kubernetes_version" { type = string }
variable "admin_role_arn" { type = string }
variable "instance_types" { type = list(string) }
variable "enable_cloudhsm" { type = bool }
data "aws_availability_zones" "available" { state = "available" }
locals { azs = slice(data.aws_availability_zones.available.names, 0, 3) }
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "6.0.1"
  name = var.name
  cidr = var.cidr
  azs = local.azs
  private_subnets = [for i in range(3) : cidrsubnet(var.cidr, 4, i)]
  public_subnets = [for i in range(3) : cidrsubnet(var.cidr, 8, i + 64)]
  enable_nat_gateway = true
  one_nat_gateway_per_az = true
  single_nat_gateway = false
  enable_dns_hostnames = true
  enable_dns_support = true
  enable_flow_log = true
  create_flow_log_cloudwatch_iam_role = true
  create_flow_log_cloudwatch_log_group = true
  flow_log_cloudwatch_log_group_retention_in_days = 90
  public_subnet_tags = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }
}
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "21.25.0"
  name = var.name
  kubernetes_version = var.kubernetes_version
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  endpoint_private_access = true
  endpoint_public_access = false
  enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = 90
  enable_cluster_creator_admin_permissions = false
  access_entries = {
    deployment = {
      principal_arn = var.admin_role_arn
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }
  addons = {
    coredns = {}
    kube-proxy = {}
    vpc-cni = { before_compute = true, configuration_values = jsonencode({ enableNetworkPolicy = "true" }) }
    eks-pod-identity-agent = {}
  }
  eks_managed_node_groups = {
    application = {
      instance_types = var.instance_types
      ami_type = "AL2023_x86_64_STANDARD"
      min_size = 3
      max_size = 12
      desired_size = 3
      metadata_options = { http_endpoint = "enabled", http_tokens = "required", http_put_response_hop_limit = 1 }
      block_device_mappings = {
        xvda = { device_name = "/dev/xvda", ebs = { volume_size = 80, volume_type = "gp3", encrypted = true, delete_on_termination = true } }
      }
    }
  }
}
resource "aws_cloudhsm_v2_cluster" "application" {
  count = var.enable_cloudhsm ? 1 : 0
  hsm_type = "hsm2m.medium"
  mode = "FIPS"
  subnet_ids = module.vpc.private_subnets
  tags = { Name = var.name }
  lifecycle { prevent_destroy = true }
}
resource "aws_cloudhsm_v2_hsm" "application" {
  count = var.enable_cloudhsm ? 2 : 0
  cluster_id = aws_cloudhsm_v2_cluster.application[0].cluster_id
  subnet_id = module.vpc.private_subnets[count.index]
}
output "cluster_name" { value = module.eks.cluster_name }
output "vpc_id" { value = module.vpc.vpc_id }
output "private_subnets" { value = module.vpc.private_subnets }
