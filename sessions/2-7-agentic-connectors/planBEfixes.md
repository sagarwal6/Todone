# Todone Backend Security & Sync Fixes

**Date:** February 10, 2026
**Updated:** February 11, 2026
**Source:** Security audit of OAuth, Gmail, Calendar, Contacts, and data persistence

## Summary of Completed Work (Feb 11)

### Critical Security Fixes ✅
- OAuth tokens now encrypted at rest (with safeDecrypt for legacy plaintext)
- gmail.send scope removed (only gmail.compose for drafts)
- Chat API requires authentication
- Debug logging removed from gmail.ts
- PII redaction before sending to LLM

### Additional Security Improvements ✅
- PKCE upgraded to S256 (SHA-256)
- Token revocation on sign out
- Rate limiting on chat (20/min) and agent_run (3/min) endpoints
- Confirm endpoint uses getValidAccessToken() for auto-refresh
- Token buffer increased to 10 minutes
- NextAuth encrypts tokens on sign-in
- Missing OAuth scopes added (gmail.compose, calendar.events)

### Database Migrations ✅ PUSHED
- `007_fix_rls_policies.sql` - Fixes broken RLS policies
- `008_tasks_sync_columns.sql` - Adds sync columns

### Agent Progress UI Enhancement ✅
- Redesigned AgentProgress component with detailed vertical step list in a box
- Added `AgentStepSummary` type for persisted step data
- Added `agentSteps` field to Task interface for persistence
- Steps now persist across page refreshes (stored in localStorage)
- Shows: tool icon, human-friendly label, search query details, duration badges
- Header shows "Working on it..." (running) or "Completed" (done)

---

---

## 🚨 CRITICAL VULNERABILITIES (Fix Before Production)

| Issue | Location | Risk | Status |
|-------|----------|------|--------|
| **OAuth tokens stored plaintext** | `lib/google/auth.ts` | Token theft | ✅ DONE - encrypt/decrypt with safeDecrypt for migration |
| **Broken RLS policies** | `migrations/003_*.sql` | Data leakage | ✅ DONE - `migrations/007_fix_rls_policies.sql` |
| **gmail.send scope requested** | `lib/google/auth.ts:17-26` | Unauthorized sending | ✅ DONE - Only gmail.compose now |
| **Chat API unauthenticated** | `app/api/chat/route.ts` | API abuse, cost attack | ✅ DONE - getServerSession() check added |
| **PII in localStorage** | `lib/storage.ts` | XSS → data theft | ⏳ Requires Phase 2-5 (Sync Infrastructure) |
| **Debug logs leak email headers** | `lib/google/gmail.ts:270,283,503` | PII exposure | ✅ DONE - All [GMAIL DEBUG] removed |
| **No PII redaction before LLM** | `lib/ai/execute-tool.ts` | SSN/CC# sent to Claude | ✅ DONE - redactPII() and redactEmailPII() |

---

## HIGH SEVERITY

| Issue | Location | Risk | Status |
|-------|----------|------|--------|
| PKCE uses `plain` not `S256` | `lib/google/auth.ts:45-60` | Token interception | ✅ DONE - Uses SHA-256 now |
| No refresh token rotation validation | `lib/google/auth.ts:162` | Token reuse | ✅ DONE - rotates on refresh |
| Sync endpoint allows ID injection | `app/api/tasks/sync/route.ts` | Data corruption | ⏳ Requires Phase 4 |
| Server-side rate limiting unenforced | Missing | API abuse | ✅ DONE - chat & agent_run endpoints |
| No data retention policy | Missing | GDPR violation | ⏳ Future work |

---

## MEDIUM SEVERITY

| Issue | Location | Status |
|-------|----------|--------|
| Token buffer too small (5min) | `lib/google/auth.ts:200` | ✅ DONE - Increased to 10 min |
| Debug endpoint exposes metadata | `app/api/debug/oauth` | ⏳ TODO - Delete or add admin auth |
| Audit log not tamper-proof | `audit_log` table | ⏳ Future work |
| No token revocation on logout | NextAuth config | ✅ DONE - signOut event revokes tokens |
| Confirm endpoint skips refresh | `app/api/tasks/[taskId]/confirm` | ✅ DONE - Uses getValidAccessToken()

---

## Phase 0: Security Fixes (MUST DO FIRST) ✅ COMPLETE

### 1. Encrypt OAuth Tokens ✅

**File:** `lib/google/auth.ts`

```typescript
// In storeTokens():
import { encrypt } from '@/lib/utils/encryption';

access_token: await encrypt(tokens.access_token),
refresh_token: tokens.refresh_token ? await encrypt(tokens.refresh_token) : null,

// In getValidAccessToken():
import { decrypt } from '@/lib/utils/encryption';

return await decrypt(tokens.access_token);
```

### 2. Fix RLS Policies ✅

**File:** `supabase/migrations/007_fix_rls_policies.sql` (created)

```sql
-- Remove broken policies
DROP POLICY IF EXISTS "Service role full access to profiles" ON profiles;
DROP POLICY IF EXISTS "Service role full access to oauth_tokens" ON oauth_tokens;

-- Note: Since we use NextAuth (not Supabase Auth), auth.uid() won't work.
-- Solution: Use service role on server, enforce user filtering in API routes.
-- RLS provides defense-in-depth, not primary access control.
```

### 3. Remove gmail.send Scope ✅

**File:** `lib/google/auth.ts`

```typescript
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',  // Drafts only
  // REMOVED: 'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
```

### 4. Add Auth to Chat Endpoint ✅

**File:** `app/api/chat/route.ts`

```typescript
import { getServerSession } from 'next-auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ... rest of handler
}
```

### 5. Remove Debug Logging ✅

**File:** `lib/google/gmail.ts`

Deleted all `[GMAIL DEBUG]` statements.

---

## Phase 1: Schema Migration ✅ COMPLETE

**File:** `supabase/migrations/008_tasks_sync_columns.sql` (created)

```sql
-- Add columns for sync support
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS feedback jsonb,
  ADD COLUMN IF NOT EXISTS agent_quick_info jsonb,
  ADD COLUMN IF NOT EXISTS custom_prompt text,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;  -- Soft delete for sync

-- Update status enum to match client
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'researching';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'personal';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'archived';

-- Indexes for sync queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_not_deleted ON tasks(user_id) WHERE deleted_at IS NULL;

-- Version increment trigger (server-side, authoritative)
CREATE OR REPLACE FUNCTION increment_task_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_version_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION increment_task_version();
```

---

## Phase 2: Sync Infrastructure

### New Files to Create

| File | Purpose |
|------|---------|
| `lib/sync/index.ts` | Main sync orchestration |
| `lib/sync/queue.ts` | Offline sync queue with retry logic |
| `lib/sync/merge.ts` | Server-wins conflict resolution + array merge |
| `lib/sync/realtime.ts` | Filtered Supabase realtime subscriptions |
| `lib/sync/transforms.ts` | Client ↔ Supabase type conversion |
| `hooks/useTaskSync.ts` | React hook integrating sync with UI |

### Conflict Resolution (Server-Authoritative)

```typescript
// Use SERVER timestamps (updated_at), not client timestamps
// Server version is authoritative - client never "wins"

function resolveConflict(local: Task, remote: Task): Task {
  // Server version always wins for scalar fields
  const merged = { ...remote };

  // Special handling for arrays: APPEND-MERGE (not LWW)
  merged.chatMessages = mergeMessages(
    local.chatMessages || [],
    remote.chatMessages || []
  );

  return merged;
}

// Deduplicate messages by ID, sort by timestamp
function mergeMessages(local: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const msg of [...local, ...remote]) {
    if (!byId.has(msg.id) || byId.get(msg.id)!.timestamp < msg.timestamp) {
      byId.set(msg.id, msg);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
}
```

### Sync Flow

```typescript
// 1. On app load - localStorage has IDs only, fetch full data from Supabase
const localTaskIds = getLocalTaskIds();   // Just IDs, no PII
const remoteTasks = await fetchSupabase(); // Full data from server
setTasks(remoteTasks);                     // Server is source of truth
saveLocalTaskIds(remoteTasks.map(t => t.id)); // Cache IDs only

// 2. On local write - optimistic UI, server validates
updateLocalUI(id, updates);                // Optimistic
const result = await syncToServer(id, updates); // Server applies
if (result.conflict) {
  // Server wins - revert local to server state
  applyServerState(result.serverTask);
}

// 3. Realtime subscription - MUST filter by user_id
supabase.channel('tasks-sync')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
    filter: `user_id=eq.${userId}`,  // SECURITY: Filter by user
  }, (payload) => {
    if (payload.new.version > localTask.version) {
      applyRemoteChange(payload.new);
    }
  });
```

### Offline Queue Schema

```typescript
interface SyncQueueItem {
  id: string;
  taskId: string;
  operation: 'create' | 'update' | 'delete';
  data: Partial<Task>;
  timestamp: number;
  retries: number;
  maxRetries: 3;
  lastError?: string;
}

// Queue stored in localStorage (max 100 items)
const SYNC_QUEUE_KEY = 'todone:sync-queue';
```

---

## Phase 3: Update Existing Files

| File | Changes |
|------|---------|
| `hooks/useTasks.ts` | Add sync integration, realtime subscription |
| `lib/storage.ts` | Store only task IDs, add queue helpers |
| `lib/types.ts` | Add sync types (SyncStatus, SyncQueueItem) |
| `contexts/AgentContext.tsx` | Persist agent progress to Supabase |
| `app/page.tsx` | Initialize sync on auth |

---

## Phase 4: API Endpoints with Security

### New Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tasks` | Fetch all user tasks from Supabase |
| `POST /api/tasks/sync-batch` | Batch sync with ownership validation |
| `DELETE /api/tasks/[taskId]` | Soft delete (set deleted_at) |

### Sync Endpoint with Ownership Validation

**File:** `app/api/tasks/sync/route.ts`

```typescript
import { validate as isValidUUID } from 'uuid';
import sanitizeHtml from 'sanitize-html';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', session.user.email)
    .single();

  const taskData = await request.json();

  // SECURITY: Validate UUID format
  if (!isValidUUID(taskData.id)) {
    return Response.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  // SECURITY: Check if task exists with different owner
  const { data: existing } = await supabaseAdmin
    .from('tasks')
    .select('user_id, version')
    .eq('id', taskData.id)
    .single();

  if (existing && existing.user_id !== profile.id) {
    // Task exists but belongs to someone else - REJECT
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // SECURITY: Sanitize title (prevent XSS)
  const sanitizedTitle = sanitizeHtml(taskData.title, { allowedTags: [] });

  // Upsert with server-side version increment
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .upsert({
      id: taskData.id,
      user_id: profile.id,  // Always use authenticated user
      title: sanitizedTitle,
      status: taskData.status,
      // version incremented by trigger
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Return server version for conflict detection
  return Response.json({
    task,
    conflict: existing && existing.version >= taskData.version,
  });
}
```

---

## Phase 5: Migration Path

```typescript
async function migrateUserTasks(userId: string): Promise<void> {
  const localTasks = getLocalTasks();
  const { data: remoteTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);

  // Case 1: No local tasks - just use remote
  if (localTasks.length === 0) {
    return; // Remote is already correct
  }

  // Case 2: No remote tasks - migrate all local
  if (!remoteTasks || remoteTasks.length === 0) {
    await supabase.from('tasks').insert(
      localTasks.map(t => taskToSupabase(t, userId))
    );
    clearLocalTasks(); // Clean up localStorage
    return;
  }

  // Case 3: BOTH have tasks - MERGE them
  const remoteById = new Map(remoteTasks.map(t => [t.id, t]));
  const toInsert: Task[] = [];
  const toUpdate: Task[] = [];

  for (const local of localTasks) {
    const remote = remoteById.get(local.id);
    if (!remote) {
      // Local-only task - insert to server
      toInsert.push(local);
    } else if (local.updatedAt > new Date(remote.updated_at).getTime()) {
      // Local is newer - update server (but server will validate)
      toUpdate.push(local);
    }
    // If remote is newer, server version wins (no action needed)
  }

  if (toInsert.length > 0) {
    await supabase.from('tasks').insert(
      toInsert.map(t => taskToSupabase(t, userId))
    );
  }

  for (const task of toUpdate) {
    await supabase.from('tasks')
      .update(taskToSupabase(task, userId))
      .eq('id', task.id)
      .eq('user_id', userId); // SECURITY: Validate ownership
  }

  // Clear localStorage - Supabase is now source of truth
  clearLocalTasks();
}
```

---

## Phase 6: PII Protection for LLM ✅ COMPLETE

**File:** `lib/ai/execute-tool.ts`

```typescript
// Before sending email content to Claude
function redactPII(text: string): string {
  return text
    // SSN: 123-45-6789 or 123 45 6789
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN REDACTED]')
    // Credit card: 16 digits with optional spaces/dashes
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CC REDACTED]')
    // Account numbers: "Account: 123456789" or "Account #123456789"
    .replace(/account\s*#?\s*:?\s*\d{6,}/gi, '[ACCOUNT REDACTED]')
    // Phone numbers (optional - may want to keep for quick info)
    // .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
}

// In executeGmailRead():
const emailContent = await readEmail(accessToken, args.messageId);
emailContent.body = redactPII(emailContent.body);
return emailContent;
```

---

## iOS App Considerations

**Challenge:** NextAuth session doesn't transfer to iOS app.

**Option A: Supabase Auth (Recommended for iOS)**
- Use Supabase Auth directly on iOS (Google OAuth)
- Creates a Supabase user linked to same Google account
- RLS works natively with `auth.uid()`
- Requires: Link Supabase user to NextAuth profile by email

**Option B: API Proxy with Token Exchange**
- iOS calls Next.js API endpoints
- Exchange NextAuth session for short-lived API token
- More work but keeps auth centralized

**Option C: Shared JWT**
- Issue JWT from NextAuth that iOS can verify
- Requires custom JWT validation on both platforms

---

## Verification Checklist

### Security Tests (Do First)

- [x] OAuth tokens encrypted in database (new tokens encrypted, legacy plaintext handled via safeDecrypt)
- [x] gmail.send scope removed from OAuth request
- [x] Chat endpoint rejects unauthenticated requests
- [x] Chat endpoint rate limited (20/min, 100/hour, 500/day)
- [x] Agent run endpoint rate limited (3/min, 20/hour, 50/day)
- [x] Token revocation on sign out
- [x] PKCE uses S256 (SHA-256)
- [x] Confirm endpoint uses getValidAccessToken() for auto-refresh
- [ ] Sync endpoint rejects tasks owned by other users (requires Phase 4)
- [ ] Realtime subscription filtered by user_id (requires Phase 2)
- [ ] No PII in localStorage (only task IDs) (requires Phase 2-5)
- [x] Debug logging removed from gmail.ts
- [x] PII redaction before sending to LLM

### Functional Tests

1. **Basic sync:** Create task on web → appears on mobile within 2s
2. **Offline edit:** Edit task offline → syncs when reconnected
3. **Conflict:** Edit same task on two devices → server version wins
4. **Deletion sync:** Delete task on device A → disappears on device B
5. **Chat merge:** Send messages on both devices → all messages appear
6. **Refresh persistence:** Refresh page → all data persists from Supabase

### Edge Cases

- [ ] User with 1000+ tasks - pagination works
- [ ] User offline for 24h - queue processes correctly
- [ ] Failed sync items retry with backoff
- [ ] Clock skew between devices doesn't cause issues

---

## Future Work

### Data Retention & GDPR

- Auto-delete completed tasks after 90 days
- User data export endpoint (`GET /api/user/export`)
- Account deletion endpoint (`DELETE /api/user`)
- Audit log rotation (1 year retention)

### Tiered Prompt Structure for Emails

- HIGH tier: Full email body (with PII redaction)
- MEDIUM tier: Subject + sender + snippet
- LOW tier: Grouped summary
- SKIP tier: Not sent to LLM at all
