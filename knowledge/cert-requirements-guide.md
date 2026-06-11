# Certification Requirements Guide — Herald Knowledge Base
*Foundry IQ Knowledge Source · Synthetic data only*

## Purpose
This guide maps Azure service areas to the Microsoft certifications required for engineers to safely operate, review, and deploy changes to those services.

## Auth Service Requirements
Changes to authentication middleware, token services, session stores, or identity providers require:
- **AZ-500** (Azure Security Engineer Associate) — mandatory. Covers identity protection, key management, secure networking, and threat detection. Required to safely review auth-layer changes.
- **SC-300** (Microsoft Identity and Access Administrator) — mandatory. Covers Entra ID, conditional access, MFA, and federation. Required for identity and session management changes.
- **SC-100** (Microsoft Cybersecurity Architect) — recommended for senior engineers owning breaking auth changes.

## API Gateway Requirements
Changes to API routing, rate limiting, middleware chains, or public-facing endpoints require:
- **AZ-204** (Azure Developer Associate) — mandatory. Covers App Service, Functions, API Management, and integration patterns.
- **AZ-400** (Azure DevOps Engineer Expert) — mandatory. Covers CI/CD, deployment pipelines, and release management.

## Data Layer Requirements
Changes to database schemas, migrations, ORM configurations, or data pipelines require:
- **DP-203** (Azure Data Engineer Associate) — mandatory. Covers data storage, processing, and pipeline orchestration.
- **DP-900** (Azure Data Fundamentals) — recommended baseline for all data-layer contributors.

## Frontend Requirements
Changes to React components, UI state management, or user-facing interfaces require:
- **AZ-204** (Azure Developer Associate) — mandatory for engineers deploying to Azure-hosted frontends.

## Infrastructure / DevOps Requirements
Changes to CI/CD pipelines, Docker configurations, Kubernetes manifests, or deployment scripts require:
- **AZ-400** (Azure DevOps Engineer Expert) — mandatory.
- **AZ-104** (Azure Administrator Associate) — mandatory. Covers resource management, networking, and identity.

## Study Recommendations
- Engineers with > 20 meeting hours/week: target 4h/week study blocks in preferred morning/afternoon windows
- Engineers with < 15 meeting hours/week: can sustain 8h/week study blocks
- Recommended practice score before exam attempt: ≥75%
- All study materials available via Microsoft Learn: learn.microsoft.com
