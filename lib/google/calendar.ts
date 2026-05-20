import { getCalendarClient } from "./auth";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

export type BusyBlock = { start: Date; end: Date };

export type CreateEventParams = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;                   // IANA tz for the event display (host tz)
  attendees: Array<{ email: string; displayName?: string }>;
  /** Free-form location string. Zoom URL for video, address for in-person. */
  location?: string;
};

/**
 * Returns busy time blocks on the host calendar within [timeMin, timeMax).
 * All returned times are in UTC. Only queries the primary calendar (or
 * GOOGLE_CALENDAR_ID if set); shared/subscribed calendars are intentionally
 * out of scope for Phase 1.
 */
export async function getFreeBusy(
  timeMin: Date,
  timeMax: Date
): Promise<BusyBlock[]> {
  const calendar = getCalendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: CALENDAR_ID }],
    },
  });
  const busy = res.data.calendars?.[CALENDAR_ID]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
}

/**
 * Creates a calendar event and notifies all attendees by email
 * (sendUpdates: 'all'). Returns the event ID. Throws if Google returns
 * no event ID — callers should treat that as a hard failure.
 *
 * The `location` param goes into the Calendar event's location field
 * (and shows up in attendee invites as "Where"). For video bookings we
 * pass the Zoom URL; for in-person bookings we pass the address. No
 * Google Meet conference is auto-created — Zoom replaces it.
 */
export async function createEvent(
  params: CreateEventParams
): Promise<{ eventId: string }> {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: "all",
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start.toISOString(), timeZone: params.timeZone },
      end: { dateTime: params.end.toISOString(), timeZone: params.timeZone },
      attendees: params.attendees,
    },
  });
  const eventId = res.data.id;
  if (!eventId) {
    throw new Error("Google Calendar: event created but no event ID returned");
  }
  return { eventId };
}

/**
 * Cancels (deletes) a calendar event and notifies attendees. Idempotent
 * from the API's perspective if the event is already gone — Google returns
 * 410 Gone in that case, which we treat as success.
 */
export async function cancelEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
      sendUpdates: "all",
    });
  } catch (err: unknown) {
    const status = (err as { code?: number; status?: number }).code
      ?? (err as { code?: number; status?: number }).status;
    if (status === 404 || status === 410) return;
    throw err;
  }
}

/**
 * Updates an event's start/end times and notifies attendees. The timeZone
 * argument is required so Google interprets the new dateTime values
 * unambiguously — it defaults to the host's tz; callers pass it through
 * from availability.ts.
 */
export async function updateEvent(
  eventId: string,
  newStart: Date,
  newEnd: Date,
  timeZone: string
): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: "all",
    requestBody: {
      start: { dateTime: newStart.toISOString(), timeZone },
      end: { dateTime: newEnd.toISOString(), timeZone },
    },
  });
}
