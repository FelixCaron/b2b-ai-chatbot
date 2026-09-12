terraform {
  required_version = ">= 1.5.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.15"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.11"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }

  # No backend configured, on purpose — this repository does not know where you
  # want state to live. Without one, state is a file in this directory: fine
  # for one person on one machine, and a way to lose an environment the moment
  # that machine goes away or a second person runs `apply`. Configure ONE of
  # these before the first apply if either is a possibility.
  #
  # It matters more here than in most configs: this state holds the only record
  # linking these resources to the live Vercel projects and Supabase databases.
  # Lose it and the next `apply` tries to CREATE them, hits the name collisions,
  # and you are back to importing by hand.
  #
  # backend "remote" {                 # HCP Terraform, free tier is enough
  #   organization = "your-org"
  #   workspaces { name = "dorafi" }
  # }
  #
  # backend "s3" {                     # any S3-compatible bucket
  #   bucket = "your-terraform-state-bucket"
  #   key    = "dorafi/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

provider "supabase" {
  access_token = var.supabase_access_token
}

provider "github" {
  token = var.github_token
  owner = split("/", var.github_repo)[0]
}
