// Auth
export {
  GOOGLE_SCOPES,
  generatePKCE,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  storeTokens,
  revokeTokens,
  hasRequiredScopes,
} from './auth';

// Gmail (read-only)
export {
  searchEmails,
  readEmail,
  searchEmailsPaginated,
  getSentEmails,
  getThreadInfo,
} from './gmail';
export type { EmailMetadata, EmailContent } from './gmail';

// Calendar (read-only)
export {
  listEvents,
  getEvent,
  checkConflicts,
  findFreeTime,
} from './calendar';
export type { CalendarEvent } from './calendar';

// Contacts
export {
  searchContacts,
  getContact,
  listContacts,
  findContactByEmail,
} from './contacts';
export type { Contact } from './contacts';
