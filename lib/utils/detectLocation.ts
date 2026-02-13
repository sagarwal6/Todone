/**
 * Location Detection Utility
 *
 * Automatically detects user's location from calendar events.
 * Looks for patterns in event locations to determine home city.
 */

// Define minimal type for calendar events (avoiding googleapis dependency)
interface CalendarEventLike {
  location?: string | null;
}

interface LocationCandidate {
  city: string;
  state?: string;
  country?: string;
  count: number;
  fullLocation: string;
}

/**
 * Extract city/state from a location string
 * Handles formats like:
 * - "123 Main St, San Francisco, CA 94102"
 * - "San Francisco, CA"
 * - "Anthropic HQ, San Francisco"
 */
function parseLocation(location: string): { city?: string; state?: string; full: string } | null {
  if (!location || location.length < 3) return null;

  // Skip virtual/online locations
  const virtualPatterns = /zoom|meet\.google|teams\.microsoft|webex|virtual|online|video call/i;
  if (virtualPatterns.test(location)) return null;

  // Try to extract city, state pattern (e.g., "San Francisco, CA")
  // Common US format: City, ST or City, State
  const cityStateMatch = location.match(/([A-Za-z\s]+),\s*([A-Z]{2})\b/);
  if (cityStateMatch) {
    return {
      city: cityStateMatch[1].trim(),
      state: cityStateMatch[2],
      full: location,
    };
  }

  // Try: "City, State Name" (e.g., "San Francisco, California")
  const cityFullStateMatch = location.match(/([A-Za-z\s]+),\s*(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)/i);
  if (cityFullStateMatch) {
    return {
      city: cityFullStateMatch[1].trim(),
      state: cityFullStateMatch[2],
      full: location,
    };
  }

  // For addresses with street numbers, try to extract city
  // Format: "123 Street Name, City, ..."
  const addressMatch = location.match(/\d+[^,]+,\s*([A-Za-z\s]+),/);
  if (addressMatch) {
    return {
      city: addressMatch[1].trim(),
      full: location,
    };
  }

  return null;
}

/**
 * Detect user's primary location from calendar events
 */
export async function detectLocationFromCalendar(
  events: CalendarEventLike[]
): Promise<string | null> {
  const locationCounts = new Map<string, LocationCandidate>();

  for (const event of events) {
    const location = event.location;
    if (!location) continue;

    const parsed = parseLocation(location);
    if (!parsed?.city) continue;

    // Normalize city name for counting
    const cityKey = parsed.city.toLowerCase();

    const existing = locationCounts.get(cityKey);
    if (existing) {
      existing.count++;
    } else {
      locationCounts.set(cityKey, {
        city: parsed.city,
        state: parsed.state,
        count: 1,
        fullLocation: parsed.full,
      });
    }
  }

  // Find the most common location
  let topLocation: LocationCandidate | null = null;
  for (const candidate of locationCounts.values()) {
    if (!topLocation || candidate.count > topLocation.count) {
      topLocation = candidate;
    }
  }

  if (!topLocation || topLocation.count < 2) {
    // Need at least 2 events in the same city to be confident
    return null;
  }

  // Format as "City, ST" or "City, State"
  if (topLocation.state) {
    return `${topLocation.city}, ${topLocation.state}`;
  }
  return topLocation.city;
}

/**
 * Detect location from email signatures (future enhancement)
 * Would look for patterns like addresses in email footers
 */
export async function detectLocationFromEmails(
  // emails: gmail_v1.Schema$Message[]
): Promise<string | null> {
  // TODO: Implement email signature parsing
  // Look for patterns like:
  // - "Based in San Francisco"
  // - Address in signature block
  // - Company HQ location
  return null;
}
