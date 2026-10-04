variable "primary_region" {
  type = string
  default = "us-east-1"
}
variable "secondary_region" {
  type = string
  default = "us-west-2"
  validation {
    condition = var.secondary_region != var.primary_region
    error_message = "Primary and secondary regions must differ."
  }
}
variable "environment" {
  type = string
  default = "production"
  validation {
    condition = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "Environment must be a lowercase deployment identifier."
  }
}
variable "kubernetes_version" {
  type = string
  description = "AWS-supported EKS version selected and verified by the operator."
  validation {
    condition = can(regex("^1\\.[0-9]{2}$", var.kubernetes_version))
    error_message = "Use a supported EKS minor version, such as 1.34."
  }
}
variable "admin_role_arn" {
  type = string
  description = "Existing audited IAM role granted cluster administrator access; not an IAM user."
  validation {
    condition = can(regex("^arn:aws:iam::[0-9]{12}:role/.+$", var.admin_role_arn))
    error_message = "An existing IAM role ARN is required."
  }
}
variable "instance_types" {
  type = list(string)
  default = ["m6i.large"]
  validation {
    condition = length(var.instance_types) > 0
    error_message = "At least one node instance type is required."
  }
}
variable "enable_cloudhsm" {
  type = bool
  default = false
  description = "Provision two hardware HSMs per region. Requires subsequent HSM initialization and Crypto User enrollment."
}
variable "primary_origin_hostname" {
  type = string
  description = "Existing TLS-valid primary ingress DNS name; no scheme or path."
  validation {
    condition = can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.primary_origin_hostname))
    error_message = "A deployed HTTPS origin hostname is required."
  }
}
variable "secondary_origin_hostname" {
  type = string
  description = "Existing TLS-valid secondary ingress DNS name; no scheme or path."
  validation {
    condition = can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.secondary_origin_hostname))
    error_message = "A deployed HTTPS origin hostname is required."
  }
}
