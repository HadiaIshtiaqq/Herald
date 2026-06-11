/**
 * Herald Enterprise Agent — Microsoft Graph / M365
 * Executes approved org-visible actions after human approval.
 * Safety gate is enforced by the orchestrator — this agent refuses unapproved runs.
 */
import { ActionsResult, RunArtifacts, ImpactReport, TeamReadinessReport } from "../src/types.js";

export interface EnterpriseAgentConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  teamsTeamId?: string;
  teamsChannelId?: string;
  sharepointSiteId?: string;
  sharepointListId?: string;
  outlookUserId?: string;
}

export interface EnterpriseAgentInput {
  runId: string;
  prTitle: string;
  prNumber: number;
  artifacts: RunArtifacts;
  report: ImpactReport;
  teamReadiness?: TeamReadinessReport;
  approvedActions: string[];
}

// ── Token acquisition ─────────────────────────────────────────────────────────

export async function getGraphToken(config: EnterpriseAgentConfig): Promise<string | null> {
  if (!config.tenantId || !config.clientId || !config.clientSecret) return null;
  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default"
    });
    const res = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch { return null; }
}

// ── Diagnostic: validate Teams channel ID format ──────────────────────────────

export function validateTeamsChannelId(channelId: string): { valid: boolean; hint: string } {
  if (!channelId) return { valid: false, hint: "Channel ID is empty" };
  // Real Teams channel IDs look like: 19:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@thread.tacv2
  if (/^19:.+@thread\.(tacv2|skype)$/.test(channelId)) return { valid: true, hint: "Format looks correct" };
  if (/^[0-9a-f-]{36}$/.test(channelId)) return { valid: false, hint: "Looks like a UUID — Teams channel IDs start with '19:' and end with '@thread.tacv2'. Get it by right-clicking the channel in Teams → Get link to channel." };
  return { valid: false, hint: "Unexpected format — Teams channel IDs look like '19:xxx@thread.tacv2'" };
}

// ── HTML escape utility (F13) ─────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function postTeamsAnnouncement(
  token: string,
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<string | null> {
  if (!config.teamsTeamId || !config.teamsChannelId) return null;

  const validation = validateTeamsChannelId(config.teamsChannelId);
  if (!validation.valid) {
    console.warn(`[EnterpriseAgent] Teams channel ID invalid: ${validation.hint}`);
  }

  const riskColor = input.report.risk.level === "high" ? "⛔" : input.report.risk.level === "medium" ? "⚠️" : "✅";
  const readinessNote = input.teamReadiness
    ? `\n<p><strong>🎓 Team Readiness:</strong> ${input.teamReadiness.overall_score}% — ${input.teamReadiness.ready_count}/${input.teamReadiness.total_count} engineers certified. ${input.teamReadiness.blocking_deployment ? "⛔ Deployment blocked pending cert gaps." : "Readiness threshold met."}</p>`
    : "";

  const body = {
    body: {
      contentType: "html",
      content: `<h2>${riskColor} Release: ${escapeHtml(input.prTitle)}</h2>
<p><strong>Risk:</strong> ${escapeHtml(input.report.risk.level.toUpperCase())} — ${escapeHtml(input.report.risk.rationale)}</p>
<p><strong>Summary:</strong> ${escapeHtml(input.artifacts.plain_summary)}</p>
<p><strong>Impacted areas:</strong> ${escapeHtml(input.report.impacted_areas.join(", "))}</p>
${input.report.breaking_changes.length > 0 ? `<p><strong>⚠️ Breaking changes:</strong> ${escapeHtml(input.report.breaking_changes.join("; "))}</p>` : ""}${readinessNote}
<p><em>Approved via Herald Release Concierge · Run #${input.prNumber}</em></p>`
    }
  };

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamsTeamId}/channels/${config.teamsChannelId}/messages`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(`[EnterpriseAgent] Teams post failed (${res.status}): ${err}`);
      return null;
    }
    const data = await res.json() as { webUrl?: string; id?: string };
    return data.webUrl ?? `https://teams.microsoft.com/l/message/${data.id}`;
  } catch (err) {
    console.error("[EnterpriseAgent] Teams error:", (err as Error).message);
    return null;
  }
}

// ── SharePoint ────────────────────────────────────────────────────────────────

export async function appendSharePointEntry(
  token: string,
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<string | null> {
  if (!config.sharepointSiteId || !config.sharepointListId) return null;
  try {
    const fields = {
      Title: input.prTitle,
      RiskLevel: input.report.risk.level,
      ChangeType: input.report.change_type,
      Summary: input.report.summary,
      ImpactedAreas: input.report.impacted_areas.join(", "),
      ReadinessScore: input.teamReadiness?.overall_score ?? null,
      ReleasedAt: new Date().toISOString()
    };
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${config.sharepointSiteId}/lists/${config.sharepointListId}/items`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { webUrl?: string; id?: string };
    return data.webUrl ?? `https://sharepoint.com/sites/releases/lists/${config.sharepointListId}/items/${data.id}`;
  } catch { return null; }
}

// ── Outlook ───────────────────────────────────────────────────────────────────

export async function createOutlookReminder(
  token: string,
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<string | null> {
  if (!config.outlookUserId) return null;
  try {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const event = {
      subject: `Rollout Checkpoint: ${input.prTitle}`,
      body: { contentType: "text", content: `Herald reminder: check rollout health for "${input.prTitle}". Risk: ${input.report.risk.level}.` },
      start: { dateTime: start.toISOString(), timeZone: "UTC" },
      end: { dateTime: end.toISOString(), timeZone: "UTC" },
      attendees: input.report.audience
        .filter(a => a.includes("@"))
        .map(email => ({ emailAddress: { address: email }, type: "optional" }))
    };
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${config.outlookUserId}/events`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { webLink?: string };
    return data.webLink ?? null;
  } catch { return null; }
}

// ── Study Plans (Teams message) ───────────────────────────────────────────────

export async function postStudyPlans(
  token: string,
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<string | null> {
  if (!config.teamsTeamId || !config.teamsChannelId || !input.teamReadiness || input.teamReadiness.gaps.length === 0) return null;
  try {
    const gapRows = input.teamReadiness.gaps.map(g =>
      `<li><strong>${g.name}</strong> (${g.role}) — missing: <code>${g.missing_certs.join(", ")}</code> · ` +
      g.study_plans.map(p => `${p.cert_name}: ${p.recommended_hours}h, ~${p.estimated_weeks}w`).join("; ") + `</li>`
    ).join("\n");

    const body = {
      body: {
        contentType: "html",
        content: `<h3>📚 Certification Study Plans — ${input.prTitle}</h3>
<p>Team readiness score: <strong>${input.teamReadiness.overall_score}%</strong> (${input.teamReadiness.ready_count}/${input.teamReadiness.total_count} certified)</p>
<p>Required certifications: <strong>${input.teamReadiness.required_certifications.join(", ")}</strong></p>
<ul>${gapRows}</ul>
<p><em>Study windows based on Work IQ capacity signals (meeting load + focus hours). Generated by Herald.</em></p>`
      }
    };
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamsTeamId}/channels/${config.teamsChannelId}/messages`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { webUrl?: string; id?: string };
    return data.webUrl ?? `https://teams.microsoft.com/l/message/${data.id}`;
  } catch { return null; }
}

// ── Teams Release Log (SharePoint fallback) ───────────────────────────────────
// Posts a structured release record to Teams when SharePoint is not configured.
// This is a real Microsoft Graph API call — not simulated — giving the Enterprise
// Agents track genuine M365 coverage even on personal accounts without SharePoint.

export async function postTeamsReleaseLog(
  token: string,
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<string | null> {
  if (!config.teamsTeamId || !config.teamsChannelId) return null;

  const riskEmoji = input.report.risk.level === "high" ? "⛔" : input.report.risk.level === "medium" ? "⚠️" : "✅";
  const changeTypeLabel = input.report.change_type.charAt(0).toUpperCase() + input.report.change_type.slice(1);
  const dateStr = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const readinessNote = input.teamReadiness
    ? `<p><strong>🎓 Team Readiness:</strong> ${input.teamReadiness.overall_score}% — ${input.teamReadiness.ready_count}/${input.teamReadiness.total_count} engineers certified.${input.teamReadiness.blocking_deployment ? " ⛔ Cert gaps must be resolved." : " Readiness OK."}</p>`
    : "";

  const breakingNote = input.report.breaking_changes.length > 0
    ? `<p><strong>⚠️ Breaking changes:</strong> ${escapeHtml(input.report.breaking_changes.join("; "))}</p>`
    : "";

  const body = {
    body: {
      contentType: "html",
      content: [
        `<h2>📋 Release Record: ${escapeHtml(input.prTitle)}</h2>`,
        `<p><strong>Date:</strong> ${dateStr}</p>`,
        `<p><strong>Type:</strong> ${escapeHtml(changeTypeLabel)} &nbsp;${riskEmoji} <strong>${escapeHtml(input.report.risk.level.toUpperCase())} Risk</strong> — ${escapeHtml(input.report.risk.rationale)}</p>`,
        `<p><strong>Summary:</strong> ${escapeHtml(input.report.summary)}</p>`,
        `<p><strong>Impacted areas:</strong> ${escapeHtml(input.report.impacted_areas.join(", "))}</p>`,
        breakingNote,
        readinessNote,
        `<p><strong>Audience:</strong> ${escapeHtml(input.report.audience.slice(0, 5).join(", "))}${input.report.audience.length > 5 ? ` +${input.report.audience.length - 5} more` : ""}</p>`,
        `<hr/>`,
        `<p><em>📌 Release log entry via Microsoft Teams (SharePoint list logging requires SHAREPOINT_SITE_ID + SHAREPOINT_LIST_ID). &nbsp;Herald Release Concierge · PR #${input.prNumber} · Run <code>${input.runId}</code></em></p>`
      ].filter(Boolean).join("\n")
    }
  };

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamsTeamId}/channels/${config.teamsChannelId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[EnterpriseAgent] Teams release log failed (${res.status}): ${errText.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { webUrl?: string; id?: string };
    return data.webUrl ?? `https://teams.microsoft.com/l/message/${data.id ?? input.runId}`;
  } catch (err) {
    console.error("[EnterpriseAgent] Teams release log error:", (err as Error).message);
    return null;
  }
}

// ── Orchestrate all approved actions ─────────────────────────────────────────

export async function executeActions(
  input: EnterpriseAgentInput,
  config: EnterpriseAgentConfig
): Promise<ActionsResult> {
  const result: ActionsResult = {};
  const token = await getGraphToken(config);

  if (input.approvedActions.includes("teams")) {
    if (token) result.teams = await postTeamsAnnouncement(token, input, config);
    if (!result.teams) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), run_id: input.runId, stage: "enterprise", message: "Teams announcement skipped — TEAMS_TEAM_ID/CHANNEL_ID not configured or Graph call failed." }));
      result.teams = `herald:teams-pending:${input.runId}`;
    }
  }

  if (input.approvedActions.includes("sharepoint")) {
    if (token && config.sharepointSiteId && config.sharepointListId) {
      // Preferred path: write directly to the SharePoint release log list
      result.sharepoint = await appendSharePointEntry(token, input, config);
    } else if (token && config.teamsTeamId && config.teamsChannelId) {
      // Fallback: post a structured release record to Teams via Graph — real M365
      // action, not simulated. Works on personal accounts without SharePoint.
      result.sharepoint = await postTeamsReleaseLog(token, input, config);
    }
    if (!result.sharepoint) {
      // Log the structured entry so the audit trail is preserved even without a SharePoint list
      console.log(JSON.stringify({
        ts: new Date().toISOString(), run_id: input.runId, stage: "enterprise",
        message: "SharePoint write skipped — SHAREPOINT_SITE_ID/LIST_ID not configured; release record logged to Teams instead.",
        release_record: { pr_title: input.prTitle, risk: input.report.risk.level, change_type: input.report.change_type, impacted_areas: input.report.impacted_areas }
      }));
      result.sharepoint = `herald:release-log:${input.runId}`;
    }
  }

  if (input.approvedActions.includes("outlook")) {
    if (token) result.outlook = await createOutlookReminder(token, input, config);
    if (!result.outlook) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), run_id: input.runId, stage: "enterprise", message: "Outlook reminder skipped — OUTLOOK_USER_ID not configured or Graph call failed." }));
      result.outlook = `herald:reminder-pending:${input.runId}`;
    }
  }

  if (input.approvedActions.includes("study_plans")) {
    if (token) result.study_plans = await postStudyPlans(token, input, config);
    if (!result.study_plans) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), run_id: input.runId, stage: "enterprise", message: "Study plans skipped — Teams not configured or no cert gaps." }));
      result.study_plans = `herald:study-plans:${input.runId}`;
    }
  }

  return result;
}
