/**
 * Herald Work IQ — Microsoft Graph calendar signal fetching.
 *
 * Fetches real work-context signals (meeting hours, focus availability) from
 * the Microsoft 365 calendar for each team member when Graph is configured.
 * Falls back to synthetic values from team-certifications.json when:
 *   - No Graph token is available (personal account / no M365 tenant)
 *   - A member has no UPN configured
 *   - The Graph call fails (permissions, rate limit, etc.)
 *
 * Required Graph application permission: Calendars.Read
 * (same app registration used for Teams + SharePoint enterprise actions)
 */

export interface WorkIQLiveSignal {
  member_id: string;
  meeting_hours_per_week: number;
  focus_hours_per_week: number;
  preferred_learning_slot: "Morning" | "Afternoon" | "Evening";
  source: "live" | "synthetic";
}

export type WorkIQSignalMap = Record<string, WorkIQLiveSignal>;

interface GraphCalendarEvent {
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  showAs?: string;
}

function computeWeeklyMeetingHours(events: GraphCalendarEvent[]): number {
  let totalMs = 0;
  for (const evt of events) {
    if (evt.isAllDay || evt.showAs === "free" || evt.showAs === "tentative") continue;
    try {
      const start = new Date(evt.start?.dateTime ?? "").getTime();
      const end = new Date(evt.end?.dateTime ?? "").getTime();
      const durationMs = end - start;
      // Guard against all-day or multi-day events leaking through
      if (durationMs > 0 && durationMs <= 8 * 3600_000) totalMs += durationMs;
    } catch { /* skip malformed event */ }
  }
  return Math.round((totalMs / 3600_000) * 10) / 10;
}

function inferLearningSlot(meetingHours: number): "Morning" | "Afternoon" | "Evening" {
  // Heavy meeting load → only evenings free; moderate → afternoons; light → mornings
  if (meetingHours > 22) return "Evening";
  if (meetingHours > 12) return "Afternoon";
  return "Morning";
}

async function fetchCalendarView(upn: string, token: string): Promise<GraphCalendarEvent[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const start = weekAgo.toISOString();
  const end = now.toISOString();
  const fields = "subject,start,end,isAllDay,showAs";

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/calendarView?startDateTime=${start}&endDateTime=${end}&$select=${fields}&$top=200`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: 'outlook.timezone="UTC"'
        }
      }
    );
    if (!res.ok) return [];
    const data = await res.json() as { value?: GraphCalendarEvent[] };
    return data.value ?? [];
  } catch {
    return [];
  }
}

interface MemberInput {
  id: string;
  upn?: string;
  meeting_hours_per_week: number;
  focus_hours_per_week: number;
  preferred_learning_slot: string;
}

export async function fetchLiveWorkSignals(
  members: MemberInput[],
  token: string
): Promise<WorkIQSignalMap> {
  const signals: WorkIQSignalMap = {};
  const WORK_HOURS_PER_WEEK = 40;
  const MIN_FOCUS_HOURS = 2;

  await Promise.all(
    members.map(async member => {
      if (!member.upn) {
        signals[member.id] = {
          member_id: member.id,
          meeting_hours_per_week: member.meeting_hours_per_week,
          focus_hours_per_week: member.focus_hours_per_week,
          preferred_learning_slot: (member.preferred_learning_slot as "Morning" | "Afternoon" | "Evening") ?? "Morning",
          source: "synthetic"
        };
        return;
      }

      const events = await fetchCalendarView(member.upn, token);

      if (events.length > 0) {
        const meetingHours = computeWeeklyMeetingHours(events);
        // Focus hours = work week minus meetings minus non-working overhead
        const focusHours = Math.max(MIN_FOCUS_HOURS, WORK_HOURS_PER_WEEK - meetingHours - 8);
        signals[member.id] = {
          member_id: member.id,
          meeting_hours_per_week: meetingHours,
          focus_hours_per_week: focusHours,
          preferred_learning_slot: inferLearningSlot(meetingHours),
          source: "live"
        };
      } else {
        // Graph returned no events — either no permission or no calendar activity;
        // fall back to static synthetic values rather than returning zeros
        signals[member.id] = {
          member_id: member.id,
          meeting_hours_per_week: member.meeting_hours_per_week,
          focus_hours_per_week: member.focus_hours_per_week,
          preferred_learning_slot: (member.preferred_learning_slot as "Morning" | "Afternoon" | "Evening") ?? "Morning",
          source: "synthetic"
        };
      }
    })
  );

  return signals;
}
