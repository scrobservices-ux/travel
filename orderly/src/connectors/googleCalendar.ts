import type { Connector } from "./types";
import { googleAuthorizeUrl, googleExchangeCode } from "./google";
import { freshGoogleToken } from "./util";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Google Calendar connector. Imports upcoming events into `appointments` so the
 * Scheduling agent can plan reminders and follow-ups.
 */
export const googleCalendarConnector: Connector = {
  provider: "google_calendar",
  label: "Google Calendar",
  description: "Sync upcoming events so the Scheduling agent can handle reminders.",
  oauth: {
    scopes: SCOPES,
    authorizeUrl: googleAuthorizeUrl(SCOPES),
    exchangeCode: googleExchangeCode,
  },
  sync: async (ctx, conn) => {
    const token = await freshGoogleToken(ctx, conn);
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: "25",
      singleEvents: "true",
      orderBy: "startTime",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Calendar fetch failed: ${await res.text()}`);
    const { items = [] } = (await res.json()) as { items?: any[] };

    let ingested = 0;
    for (const ev of items) {
      const startsAt = ev.start?.dateTime ?? ev.start?.date;
      if (!startsAt) continue;

      // Dedupe on a deterministic title + start-time match.
      const { data: dup } = await ctx.db
        .from("appointments")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("title", ev.summary ?? "(untitled)")
        .eq("starts_at", new Date(startsAt).toISOString())
        .maybeSingle();
      if (dup) continue;

      await ctx.db.from("appointments").insert({
        org_id: ctx.orgId,
        title: ev.summary ?? "(untitled)",
        starts_at: new Date(startsAt).toISOString(),
        ends_at: ev.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : null,
        location: ev.location ?? ev.hangoutLink ?? null,
      });
      ingested++;
    }

    return { ingested, detail: `Imported ${ingested} upcoming event(s).` };
  },
};
