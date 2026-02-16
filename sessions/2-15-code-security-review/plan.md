# Todone Security & Compliance Review — Fix Plan

> **Goal:** Pass Google Cloud security review for Gmail/Calendar/OAuth. Fix all critical, high, and medium issues found in the 2/15 code audit.

**Scope decisions (per user):**
- Email body content IS required for agent quality — enhance PII stripping instead of removing body
- Tasks + messages persist forever unless user actively deletes — no auto-retention on user-facing data
- `agent_steps.tool_output` redaction: only if it doesn't degrade agent result quality
- No attachment downloads — ever. Remove any stubs.

---

## Phase 1: Remove Debug & Dev Endpoints (CRITICAL) ✅

> Delete all debug/test API routes that are publicly accessible without authentication.

### Completed
- [x] Deleted `app/api/debug/oauth/route.ts`
- [x] Deleted `app/api/debug/anthropic/route.ts`
- [x] Deleted `app/api/debug/insight-actions/route.ts`
- [x] Deleted `app/api/test-db/route.ts`
- [x] Verified no other unauthenticated endpoints exist
- [x] Typecheck, build pass clean

---

## Phase 2: Remove Sensitive Logging (CRITICAL) ✅

> Strip all console.log statements that leak API keys, tokens, or user PII.

### Completed
- [x] Removed API key prefix logging in `lib/ai/anthropic.ts`
- [x] Removed user email logging in NextAuth signIn callback and signOut event
- [x] Removed access token prefix logging in `lib/ai/execute-tool.ts`
- [x] Removed user email from scan session check (`app/api/scan/route.ts`)
- [x] Removed email addresses from scoring debug logs (`lib/email/scoring.ts`)
- [x] Removed email subjects, sender names, from addresses from scan/metadata logs (`lib/scan/metadata.ts`)
- [x] Removed API key availability logging from web search (`lib/ai/web.ts`)
- [x] Removed profile data from auth callback log
- [x] Kept operational logs: counts, tiers, scores, status messages

### Key Files
| File | Change |
|------|--------|
| `lib/ai/anthropic.ts` | Remove API key prefix log |
| `app/api/auth/[...nextauth]/route.ts` | Remove email logging in signIn callback |

---

## Phase 3: Reconcile OAuth Scopes (CRITICAL) ✅

> Fix the mismatch between `lib/google/auth.ts` and the NextAuth config. Ensure scopes are minimal and consistent.

### Completed
- [x] Audited scopes: app is read-only only — `gmail.compose` and `calendar.events` not needed
- [x] Removed `gmail.compose` and `calendar.events` from `GOOGLE_SCOPES` in `auth.ts`
- [x] Made `GOOGLE_SCOPES` the single source of truth — NextAuth now imports from `auth.ts`
- [x] Verified `createDraft()` throws (redirects to compose URL) and `calendar_create` only builds pending drafts
- [x] Typecheck and build pass

### Testing
- Sign out and sign back in — verify OAuth consent screen shows only readonly scopes

---

## Phase 4: Enhance PII Redaction (CRITICAL) ✅

> Email body IS sent to Claude (required for task quality). Strengthen PII stripping to cover more patterns while preserving task-relevant data like policy numbers.

### Completed
- [x] Expanded `redactPII()` in `execute-tool.ts` — now covers:
  - SSN, credit cards (Visa/MC/Amex/Discover/generic), bank account numbers, routing/ABA numbers
  - IBAN, SWIFT/BIC codes
  - Passwords, API keys, auth tokens, bearer tokens in email text
  - Date of birth (multiple formats), passport numbers, driver's license numbers, medical record numbers
- [x] Preserved: policy numbers, order numbers, tracking numbers, reference IDs, invoice numbers, confirmation codes
- [x] Removed old policy number redaction (was incorrectly stripping data needed for task execution)
- [x] Added "DATA SAFETY" section to agent system prompt so Claude can explain redactions to users
  - Agent now says "That info is redacted for your security" instead of "I don't know"
- [x] Typecheck and build pass

---

## Phase 5: Privacy Policy & Terms of Service (CRITICAL) ✅

> Google API Services User Data Policy requires clear disclosure. Add /privacy and /terms pages.

### Completed
- [x] Created `/app/privacy/page.tsx` with all required sections:
  - What Todone Does, What Data We Access, How Your Data Is Used
  - No AI model training disclosure, Data transfer restrictions
  - What We Store (with retention periods), Data Security
  - Your Rights, Third-Party Services (with links to each provider's privacy policy)
  - Children's Privacy (COPPA), Google API Services Disclosure (Limited Use)
  - Changes to This Policy (30-day notice), Contact
- [x] Created `/app/terms/page.tsx` with all required sections:
  - Service Description, Google Account Access (with Limited Use reference)
  - AI-Generated Content, Your Data, Acceptable Use
  - Limitation of Liability, Termination, Age Requirement (13+)
  - Changes (30-day notice), Contact
- [x] Both are static server components with proper metadata
- [x] Verified code matches all policy claims (7/8 verified; account deletion = Phase 6)
- [x] Added Google API & Privacy Compliance rules to CLAUDE.md
- [x] Fixed regex lint errors in PII redaction (execute-tool.ts)
- [x] Typecheck, lint (errors only), and build pass

### Remaining (non-blocking)
- [ ] Add footer links to privacy/terms from the main layout or settings
- [ ] Set privacy policy URL in Google Cloud Console OAuth consent screen

---

## Phase 6: User Data Deletion Endpoint (CRITICAL) ✅

> Users must be able to delete all their data. Required for GDPR/CCPA and Google security review.

### Completed
- [x] Created `DELETE /api/user` endpoint that:
  1. Verifies authenticated session
  2. Logs anonymized deletion event in audit_log (survives via ON DELETE SET NULL)
  3. Revokes Google OAuth tokens with Google + deletes oauth_tokens row
  4. Deletes profile row — cascades to all user data (tasks → agent_steps + task_messages, rate_limits, insight_scans → insight_actions, oauth_tokens)
  5. Returns confirmation; client calls signOut()
- [x] Added account menu (three-dot) in MobileHeader replacing standalone sign-out button
- [x] Menu contains "Sign out" and "Delete account" options
- [x] Added confirmation dialog with warning and "Delete my account" button
- [x] Loading state while deletion is in progress
- [x] Typecheck, lint (errors only), and build pass

### Testing
- Create test user, add tasks, run agent, then delete account
- Verify all tables are clean for that user_id
- Verify OAuth tokens are revoked with Google
- Verify session is invalidated

### Key Files
| File | Action |
|------|--------|
| `app/api/user/route.ts` | Create DELETE handler |
| Settings/profile component | Add delete account button |

---

## Phase 7: Audit Logging for Data Access (HIGH)

> Log all Gmail/Calendar data access operations for compliance.

### Tasks
- [ ] Add audit log entries in `execute-tool.ts` for:
  - `gmail_search` — log query (not results)
  - `gmail_read` — log email ID accessed
  - `calendar_list` — log date range queried
  - `contacts_search` — log search query
- [ ] Add audit log entry in `lib/google/auth.ts` for token refresh events
- [ ] Keep audit entries minimal — IDs and action names only, no content

### Testing
- Run agent on a task, verify audit_log has entries for each Gmail/Calendar operation
- Verify no email content in audit_log entries

### Key Files
| File | Change |
|------|--------|
| `lib/ai/execute-tool.ts` | Add logAuditEvent calls per tool |
| `lib/google/auth.ts` | Log token refresh |

---

## Phase 8: Data Retention Policy (HIGH)

> Auto-cleanup old execution data. User-facing data (tasks, messages) persists until user deletes.

### Tasks
- [ ] Create Supabase SQL migration for cleanup:
  - `agent_steps` older than 90 days → delete (execution traces, not user-facing)
  - `audit_log` older than 1 year → delete
  - `rate_limits` older than 7 days → delete
  - Do NOT auto-delete: `tasks`, `task_messages`, `profiles`, `oauth_tokens`
- [ ] Create a scheduled cleanup function (Supabase cron or pg_cron)
- [ ] Document retention periods in privacy policy (Phase 5)

### Testing
- Insert old test rows, run cleanup, verify only old non-user data removed
- Verify tasks and messages are untouched

### Key Files
| File | Action |
|------|--------|
| `supabase/migrations/010_data_retention.sql` | Create retention policies |

---

## Phase 9: Remove Attachment Download Stubs (MEDIUM)

> Attachment downloads are permanently out of scope. Remove any stubs.

### Tasks
- [ ] Find and remove any attachment download stubs/placeholders in `lib/google/gmail.ts`
- [ ] Ensure agent tools don't reference attachment download capability
- [ ] Update tool descriptions if they mention attachments

### Testing
- Grep for "attachment" — only references should be metadata (has attachments: true/false)

### Key Files
| File | Change |
|------|--------|
| `lib/google/gmail.ts` | Remove attachment download stubs |
| `lib/ai/tools.ts` | Update tool descriptions if needed |

---

## Phase 10: Harden Error Responses & Stream Handling (MEDIUM)

> Prevent info leakage via error messages. Fix SSE stream timeout.

### Tasks
- [ ] Replace `error.message` in API responses with generic messages in production
  - `app/api/tasks/[taskId]/route.ts` line ~104
  - Audit other routes for same pattern
- [ ] Add 5-minute max lifetime to SSE stream in `AgentContext.tsx`
- [ ] Add `.catch()` to fire-and-forget `appendProgressEvent` RPC in `anthropic.ts`
- [ ] Fix `combineAbortSignals` event listener cleanup in `execute-tool.ts`

### Testing
- Trigger API errors — verify generic messages returned (no schema leak)
- Start long agent run, verify stream auto-closes after 5 min max
- Build passes

### Key Files
| File | Change |
|------|--------|
| `app/api/tasks/[taskId]/route.ts` | Generic error messages |
| `contexts/AgentContext.tsx` | SSE stream timeout |
| `lib/ai/anthropic.ts` | Error handling on appendProgressEvent |
| `lib/ai/execute-tool.ts` | Signal cleanup |

---

## Phase 11: Database Indexes & Hardening (MEDIUM)

> Add missing indexes for performance. Consider RLS improvements.

### Tasks
- [ ] Add index on `task_messages(task_id, created_at)` for sorted message queries
- [ ] Add index on `tasks(user_id, created_at DESC)` for recent task listings
- [ ] Evaluate RLS policy improvements — currently `USING (true)` for service_role
  - Document why hybrid session approach prevents adding user_id checks to RLS
  - Or implement user_id checks if feasible

### Testing
- Run EXPLAIN on common queries to verify indexes used
- Existing functionality unaffected

### Key Files
| File | Action |
|------|--------|
| `supabase/migrations/010_data_retention.sql` | Can combine with retention migration, or create 011 |

---

## Phase 12: Security Headers (LOW)

> Add standard security headers for defense in depth.

### Tasks
- [ ] Add to `next.config.ts` or middleware:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` (basic policy)
- [ ] Verify headers don't break PWA functionality

### Testing
- Check response headers with curl
- PWA still works on iOS Safari

### Key Files
| File | Change |
|------|--------|
| `next.config.ts` or `middleware.ts` | Add security headers |

---

## Summary

| Phase | Severity | Description |
|-------|----------|-------------|
| 1 | CRITICAL | Remove debug endpoints |
| 2 | CRITICAL | Remove sensitive logging |
| 3 | CRITICAL | Reconcile OAuth scopes |
| 4 | CRITICAL | Enhance PII redaction |
| 5 | CRITICAL | Privacy policy & terms |
| 6 | CRITICAL | User data deletion |
| 7 | HIGH | Audit logging for data access |
| 8 | HIGH | Data retention policy |
| 9 | MEDIUM | Remove attachment stubs |
| 10 | MEDIUM | Harden errors & streams |
| 11 | MEDIUM | Database indexes |
| 12 | LOW | Security headers |
