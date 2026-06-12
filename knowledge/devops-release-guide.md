# DevOps & Release Engineering Guide — Herald Knowledge Base
*Foundry IQ-pattern knowledge source · Synthetic data only*

## Purpose
This guide covers the release engineering practices required for the infrastructure and api-gateway areas, aligned to AZ-400 and AZ-104 certification objectives.

## CI/CD pipeline design (AZ-400)
Every deployment to a shared environment must flow through a pipeline — no manual pushes to production. A healthy pipeline has at minimum: build, automated tests, security scan, deployment to a staging slot, and a gated promotion to production. Quality gates should fail the pipeline rather than warn, because warnings are ignored under deadline pressure.

## Deployment strategies and rollback (AZ-400)
Blue-green deployment keeps two identical environments and switches traffic atomically, making rollback a traffic switch rather than a redeploy. Canary releases route a small percentage of traffic to the new version first, limiting the blast radius of a regression. Whichever strategy is used, rollback must be rehearsed: an untested rollback plan is a hope, not a plan.

## Infrastructure as Code (AZ-400, AZ-104)
All Azure resources should be declared in Bicep or Terraform and applied through the pipeline, so the deployed state is reproducible and reviewable. Manual portal changes cause configuration drift; drift detection should run on a schedule and flag any resource that no longer matches its template. Secrets never belong in IaC templates — reference Key Vault instead.

## GitHub Actions security (AZ-400)
Workflow files run with the repository's credentials, so a malicious pull request that modifies a workflow is a supply-chain attack vector. Use `pull_request` (not `pull_request_target`) for untrusted code, pin third-party actions to a full commit SHA, and scope the `GITHUB_TOKEN` permissions block to the minimum each job needs. Webhook endpoints receiving repository events must verify the HMAC signature before processing the payload.

## Azure resource management (AZ-104)
Resource groups should map to a workload and lifecycle, not to a team org chart, so that deleting a resource group cleanly removes one workload. Azure Policy enforces organizational standards — allowed regions, required tags, SKU restrictions — at deployment time rather than in code review. Role-Based Access Control (RBAC) assignments should target groups, not individual users, and follow least privilege: a 403 error from a service that authenticates successfully usually means a missing role assignment, not a bad credential.

## Monitoring and release health (AZ-400, AZ-104)
A release is not done when the deploy succeeds; it is done when the monitors stay green. Application Insights availability tests, alert rules on error rate and latency, and a defined rollback threshold turn "it seems fine" into an engineering decision. Post-incident reviews should produce pipeline changes, not blame.

## Study guidance for infrastructure contributors
AZ-400 candidates should be comfortable with pipeline YAML, deployment strategies, and artifact management before booking the exam; AZ-104 adds networking, storage, and identity administration. The team's bar is a 75% practice score on grounded assessments plus one supervised production deployment.
