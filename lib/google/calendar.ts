/**
 * Google Calendar API Functions (Read-Only)
 *
 * Provides calendar operations:
 * - List events
 * - Get single event
 * - Check for conflicts
 * - Find free time
 *
 * Note: We only have calendar.readonly scope. For creating events,
 * use Google Calendar URLs (see lib/utils/gmail-compose.ts)
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ============================================================================
// Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    organizer?: boolean;
    self?: boolean;
  }[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: {
      entryPointType: string;
      uri: string;
      label?: string;
    }[];
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  created: string;
  updated: string;
  htmlLink: string;
}

interface ListEventsOptions {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  calendarId?: string;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
}

interface CalendarListResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
}

// ============================================================================
// List Events
// ============================================================================

export async function listEvents(
  accessToken: string,
  options: ListEventsOptions = {}
): Promise<CalendarEvent[]> {
  const {
    timeMin = new Date().toISOString(),
    timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults = 20,
    calendarId = 'primary',
    singleEvents = true,
    orderBy = 'startTime',
  } = options;

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(Math.min(maxResults, 50)),
    singleEvents: String(singleEvents),
    orderBy,
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Calendar list failed: ${response.status} ${response.statusText}`);
  }

  const data: CalendarListResponse = await response.json();
  return data.items || [];
}

// ============================================================================
// Get Single Event
// ============================================================================

export async function getEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get event: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Check for Conflicts
// ============================================================================

export async function checkConflicts(
  accessToken: string,
  start: string,
  end: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> {
  const events = await listEvents(accessToken, {
    timeMin: start,
    timeMax: end,
    calendarId,
    singleEvents: true,
  });

  // Filter to events that actually overlap
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  return events.filter((event) => {
    const eventStart = new Date(event.start.dateTime || event.start.date || '').getTime();
    const eventEnd = new Date(event.end.dateTime || event.end.date || '').getTime();

    // Check for overlap
    return eventStart < endTime && eventEnd > startTime;
  });
}

// ============================================================================
// Find Free Time
// ============================================================================

export async function findFreeTime(
  accessToken: string,
  date: string, // YYYY-MM-DD
  durationMinutes: number,
  preferredStartHour: number = 9,
  preferredEndHour: number = 17,
  calendarId: string = 'primary'
): Promise<{ start: string; end: string }[]> {
  const dayStart = new Date(`${date}T${String(preferredStartHour).padStart(2, '0')}:00:00`);
  const dayEnd = new Date(`${date}T${String(preferredEndHour).padStart(2, '0')}:00:00`);

  const events = await listEvents(accessToken, {
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    calendarId,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const freeSlots: { start: string; end: string }[] = [];
  let currentTime = dayStart.getTime();

  for (const event of events) {
    const eventStart = new Date(event.start.dateTime || event.start.date || '').getTime();
    const eventEnd = new Date(event.end.dateTime || event.end.date || '').getTime();

    // Check if there's a gap before this event
    if (eventStart > currentTime) {
      const gapMinutes = (eventStart - currentTime) / (1000 * 60);
      if (gapMinutes >= durationMinutes) {
        freeSlots.push({
          start: new Date(currentTime).toISOString(),
          end: new Date(currentTime + durationMinutes * 60 * 1000).toISOString(),
        });
      }
    }

    // Move current time to end of this event
    currentTime = Math.max(currentTime, eventEnd);
  }

  // Check for time after last event
  if (currentTime < dayEnd.getTime()) {
    const remainingMinutes = (dayEnd.getTime() - currentTime) / (1000 * 60);
    if (remainingMinutes >= durationMinutes) {
      freeSlots.push({
        start: new Date(currentTime).toISOString(),
        end: new Date(currentTime + durationMinutes * 60 * 1000).toISOString(),
      });
    }
  }

  return freeSlots;
}
