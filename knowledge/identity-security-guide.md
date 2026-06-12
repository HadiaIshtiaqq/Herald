# Identity & Security Guide — Herald Knowledge Base
*Foundry IQ-pattern knowledge source · Synthetic data only*

## Purpose
This guide covers the identity and security concepts engineers must master before making changes to the auth-service area, aligned to SC-300 and AZ-500 certification objectives.

## Conditional Access fundamentals (SC-300)
Conditional Access policies in Microsoft Entra ID evaluate signals such as user identity, device compliance, location, and sign-in risk before granting access to a resource. Policies are enforced after first-factor authentication completes, which means they cannot be used as a first line of defense against credential theft. A well-designed policy set always includes a break-glass account excluded from all policies to prevent tenant lockout.

## Token security and session management (AZ-500)
Access tokens should be short-lived (the Entra ID default is around one hour) and must never be persisted in browser local storage where they are exposed to XSS. Refresh tokens are long-lived and must be stored server-side or in secure, HTTP-only cookies. Rotating the token signing key invalidates all outstanding sessions, so key rotation for an auth service must be coordinated with a forced re-authentication window.

## Managed identities for service-to-service auth (SC-300)
A managed identity is an Entra ID identity assigned to an Azure resource, allowing it to authenticate to other services without any credential stored in code or configuration. System-assigned identities share the resource's lifecycle and are deleted with it; user-assigned identities are standalone resources that can be shared across multiple services. Herald's own Graph calls use the client-credentials flow, which is the pattern managed identities replace when running inside Azure.

## Privileged Identity Management (SC-300)
Privileged Identity Management (PIM) provides just-in-time role activation: an engineer holds an *eligible* assignment and must activate it — optionally with approval and MFA — before exercising the role. Standing assignments to high-privilege roles such as Global Administrator are the single largest identity attack surface and should be converted to eligible assignments.

## Key Vault and secret hygiene (AZ-500)
Application secrets, connection strings, and certificates belong in Azure Key Vault, accessed via managed identity, never in source control or environment files committed to a repository. Key Vault soft-delete and purge protection must both be enabled in production so that a deleted secret can be recovered and a malicious purge is blocked. Secret rotation should be automated; any secret that has appeared in a chat, log, or commit must be treated as compromised and rotated immediately.

## Network security for identity services (AZ-500)
Identity endpoints should sit behind a Web Application Firewall with rate limiting to blunt password-spray attacks. Smart lockout in Entra ID distinguishes familiar sign-in locations from unfamiliar ones, locking out attackers while letting legitimate users continue. Legacy authentication protocols (IMAP, POP, SMTP AUTH) bypass Conditional Access entirely and should be blocked tenant-wide.

## Study guidance for auth-service contributors
Engineers preparing SC-300 should focus on Conditional Access design, PIM, and hybrid identity before attempting the exam; AZ-500 candidates should add Key Vault, network security, and Defender for Cloud. A practice score of 75% or higher on grounded assessments is the team's bar before booking either exam.
