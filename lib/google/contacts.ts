/**
 * Google People (Contacts) API Functions
 *
 * Provides contact operations:
 * - Search contacts
 * - Get contact details
 */

const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

// ============================================================================
// Types
// ============================================================================

export interface Contact {
  resourceName: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  emails: {
    value: string;
    type?: string; // 'home', 'work', 'other'
  }[];
  phoneNumbers?: {
    value: string;
    type?: string;
  }[];
  organizations?: {
    name?: string;
    title?: string;
  }[];
  photos?: {
    url: string;
    default?: boolean;
  }[];
}

interface PersonResource {
  resourceName: string;
  names?: { displayName: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value: string; type?: string }[];
  phoneNumbers?: { value: string; type?: string }[];
  organizations?: { name?: string; title?: string }[];
  photos?: { url: string; default?: boolean }[];
}

interface PeopleSearchResponse {
  results?: { person: PersonResource }[];
}

interface ConnectionsResponse {
  connections?: PersonResource[];
  nextPageToken?: string;
  totalPeople?: number;
}

// ============================================================================
// Search Contacts
// ============================================================================

export async function searchContacts(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<Contact[]> {
  // Use the People API search endpoint
  const params = new URLSearchParams({
    query,
    readMask: 'names,emailAddresses,phoneNumbers,organizations,photos',
    pageSize: String(Math.min(maxResults, 30)),
  });

  const response = await fetch(`${PEOPLE_API_BASE}/people:searchContacts?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    // Fall back to connections list if search fails
    if (response.status === 400) {
      return searchConnectionsList(accessToken, query, maxResults);
    }
    throw new Error(`Contacts search failed: ${response.status} ${response.statusText}`);
  }

  const data: PeopleSearchResponse = await response.json();

  if (!data.results) {
    return [];
  }

  return data.results.map((result) => parseContact(result.person));
}

/**
 * Fallback search using connections list
 */
async function searchConnectionsList(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<Contact[]> {
  const params = new URLSearchParams({
    personFields: 'names,emailAddresses,phoneNumbers,organizations,photos',
    pageSize: '100', // Get more to filter locally
  });

  const response = await fetch(`${PEOPLE_API_BASE}/people/me/connections?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Contacts list failed: ${response.status} ${response.statusText}`);
  }

  const data: ConnectionsResponse = await response.json();

  if (!data.connections) {
    return [];
  }

  const queryLower = query.toLowerCase();

  // Filter connections that match the query
  const matches = data.connections
    .filter((person) => {
      const name = person.names?.[0]?.displayName?.toLowerCase() || '';
      const emails = person.emailAddresses?.map((e) => e.value.toLowerCase()) || [];

      return (
        name.includes(queryLower) ||
        emails.some((e) => e.includes(queryLower))
      );
    })
    .slice(0, maxResults);

  return matches.map(parseContact);
}

// ============================================================================
// Get Contact
// ============================================================================

export async function getContact(
  accessToken: string,
  resourceName: string
): Promise<Contact> {
  const params = new URLSearchParams({
    personFields: 'names,emailAddresses,phoneNumbers,organizations,photos',
  });

  const response = await fetch(`${PEOPLE_API_BASE}/${resourceName}?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get contact: ${response.status} ${response.statusText}`);
  }

  const person: PersonResource = await response.json();
  return parseContact(person);
}

// ============================================================================
// List Contacts
// ============================================================================

export async function listContacts(
  accessToken: string,
  pageSize: number = 100,
  pageToken?: string
): Promise<{ contacts: Contact[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    personFields: 'names,emailAddresses,phoneNumbers,organizations,photos',
    pageSize: String(Math.min(pageSize, 1000)),
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const response = await fetch(`${PEOPLE_API_BASE}/people/me/connections?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list contacts: ${response.status} ${response.statusText}`);
  }

  const data: ConnectionsResponse = await response.json();

  return {
    contacts: (data.connections || []).map(parseContact),
    nextPageToken: data.nextPageToken,
  };
}

// ============================================================================
// Find Contact by Email
// ============================================================================

export async function findContactByEmail(
  accessToken: string,
  email: string
): Promise<Contact | null> {
  const contacts = await searchContacts(accessToken, email, 5);
  const emailLower = email.toLowerCase();

  return (
    contacts.find((c) =>
      c.emails.some((e) => e.value.toLowerCase() === emailLower)
    ) || null
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseContact(person: PersonResource): Contact {
  return {
    resourceName: person.resourceName,
    displayName: person.names?.[0]?.displayName || 'Unknown',
    givenName: person.names?.[0]?.givenName,
    familyName: person.names?.[0]?.familyName,
    emails: (person.emailAddresses || []).map((e) => ({
      value: e.value,
      type: e.type,
    })),
    phoneNumbers: person.phoneNumbers?.map((p) => ({
      value: p.value,
      type: p.type,
    })),
    organizations: person.organizations?.map((o) => ({
      name: o.name,
      title: o.title,
    })),
    photos: person.photos?.map((p) => ({
      url: p.url,
      default: p.default,
    })),
  };
}
