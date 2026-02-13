# Cross-Device Sync Plan (Revised)

Todone on web + iOS with shared Supabase backend. iOS app is a Capacitor wrapper around the mobile-responsive web app.

---

## Current Status (Updated 2026-02-13)

### What's Working - PHASE 1D COMPLETE ✅
- Tasks sync to Supabase immediately on create, update, delete
- All task fields sync (status, research, feedback, agentQuickInfo, etc.)
- DELETE is hard delete (row removed from DB, cascades to agent_steps)
- Audit log sanitized - no user data stored
- **Fetch from Supabase on page load (Supabase as source of truth)**
- **Supabase is single source of truth (no localStorage merge conflicts)**
- **Refetch on window focus for cross-device sync**
- **SyncError state for error reporting**
- **SignOut fixed** - Added `path: '/'` to NextAuth cookie config

### Cross-Device Sync Tested ✅
- Add task in Tab 1 → appears in Tab 2 on focus switch
- Complete/delete task in Tab 1 → reflected in Tab 2 on focus switch

### What's NOT Working Yet (Future Enhancements)
- Rollback on sync failure (errors are reported but not rolled back)
- Toast notifications for sync errors (syncError state available but no UI yet)
- Real-time sync without focus switch (would need Supabase Realtime)

### Next Steps for Handoff
1. **Phase 0** - Mobile responsive audit
2. **Phase 2** - PWA setup
3. **Phase 3** - Capacitor iOS app

---

**Architecture:**
```
┌─────────────┐     ┌─────────────┐
│   Web App   │     │   iOS App   │
│  (Next.js)  │     │ (Capacitor) │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │   Same web app    │
       │   loaded in       │
       │   WKWebView       │
       └─────────┬─────────┘
                 │
                 ▼
         ┌──────────────┐
         │   Supabase   │
         │  (Postgres)  │
         └──────────────┘
```

---

## Critical Corrections from Plan Review

### Status Mapping NOT Needed
Migration 008 already added client status values to the PostgreSQL enum:
```sql
ALTER TYPE task_status ADD VALUE 'pending';
ALTER TYPE task_status ADD VALUE 'researching';
ALTER TYPE task_status ADD VALUE 'personal';
ALTER TYPE task_status ADD VALUE 'completed';
ALTER TYPE task_status ADD VALUE 'archived';
```
**Use client statuses directly - no mapping layer.**

### Migration 008 Already Provides
- `version` column (for conflict resolution)
- `deleted_at` column (soft delete for sync) - NOT USED, we hard delete
- `feedback` column (jsonb)
- `agent_quick_info` column
- `custom_prompt` column
- Auto-increment version trigger
- Sync-optimized indexes

### Existing API Endpoints to Preserve
- `/api/tasks/sync/route.ts` - POST (one-way push) - **UPDATED with converters**
- `/api/tasks/[taskId]/run/route.ts` - POST (agent execution)
- `/api/tasks/[taskId]/confirm/route.ts` - POST (draft confirm) - **Audit log sanitized**
- `/api/tasks/[taskId]/cancel/route.ts` - POST (cancel agent) - **Audit log sanitized**

---

## Phase 0: Mobile-Responsive Web

Before wrapping, ensure the web app works great on mobile viewports.

### Audit & Fix
- [ ] Test on iPhone Safari (or Chrome DevTools mobile)
- [ ] Fix touch targets (min 44x44px)
- [ ] Fix spacing/padding for mobile
- [ ] Ensure task input works well on mobile keyboard
- [ ] Test swipe gestures work on touch
- [ ] Verify auth flow works on mobile Safari

### Mobile-First Adjustments
- [ ] Hide/collapse non-essential UI on small screens
- [ ] Ensure modals/dialogs are mobile-friendly
- [ ] Test landscape orientation

---

## Phase 1: Supabase-First Task Storage

Tasks stored in Supabase as source of truth, localStorage as cache only.

### 1A: Schema & Types - COMPLETE

#### TypeScript Type Fix
- [x] Update `/lib/supabase/types.ts` - Full TaskStatus enum (10 values)
- [x] Add new columns to task Row/Insert/Update types

#### Migration 009
- [x] Create `/supabase/migrations/009_task_source_steps.sql`
- [x] Add `source` column (enum: 'user' | 'insight')
- [x] Add `agent_steps_summary` column (jsonb)

#### Conversion Utilities
- [x] Add `toSupabaseTask()` to `/lib/types.ts`
- [x] Add `fromSupabaseTask()` to `/lib/types.ts`

### 1B: API Endpoints - COMPLETE

#### List & Create
- [x] Create `/app/api/tasks/route.ts`
  - [x] GET - List tasks for authenticated user (non-deleted)
  - [x] POST - Create new task using `toSupabaseTask()`

#### Single Task Operations
- [x] Create `/app/api/tasks/[taskId]/route.ts`
  - [x] GET - Fetch single task, return using `fromSupabaseTask()`
  - [x] PUT - Update task using `toSupabaseTask()`
  - [x] DELETE - **HARD DELETE** (removes row, cascades to agent_steps)

#### Update Existing Sync
- [x] Update `/app/api/tasks/sync/route.ts` to use `toSupabaseTask()` converter

---

## Phase 1.5: NextAuth Capacitor Configuration

**Critical for iOS app login to work.**

### Google Cloud Console
- [ ] Register additional redirect URIs:
  - `capacitor://localhost/api/auth/callback/google`
  - Production: `https://yourdomain.com/api/auth/callback/google`

### NextAuth Config Updates
- [x] Update `/app/api/auth/[...nextauth]/route.ts` with cookie config for Capacitor
- [ ] **Verify cookie config in Capacitor WKWebView** - Current: `sameSite: 'lax'`, `secure: true` (prod)
  - If auth doesn't persist in iOS app, try `sameSite: 'none'` + `secure: true`
  - WKWebView has cookie quirks; test OAuth login flow end-to-end

### Environment Variables
- [ ] Consider making NEXTAUTH_URL dynamic based on request origin, or:
- [ ] Use production URL and configure Capacitor to load from that URL

---

## Phase 1C: Sync Utilities - NOT STARTED

#### Core Functions
- [ ] Create `/lib/sync/taskSync.ts`
- [ ] `fetchTasksFromSupabase(): Promise<Task[]>` (uses session, not userId param)
- [ ] `syncTaskToSupabase(task: Task): Promise<Task>` (already exists in hook, could extract)

#### Conflict Resolution
- Server wins (especially agent-controlled fields)
- Use `version` column from migration 008
- No offline queue for MVP

---

## Phase 1D: Hook Rewrite - COMPLETE

### What's Done
- [x] Sync to Supabase on `addTask` (POST)
- [x] Sync to Supabase on `updateStatus`, `completeTask`, `archiveTask` (PUT)
- [x] Sync to Supabase on `deleteTask` (DELETE - hard delete)
- [x] Sync to Supabase on `setResearch`, `markAsPersonal`, `setFeedback` (PUT)
- [x] Sync to Supabase on `updateTitle`, `togglePin` (PUT)
- [x] Sync to Supabase on `setAgentQuickInfo`, `setAgentSteps` (PUT)
- [x] Added `isSyncing` state to hook return
- [x] Fetch from Supabase on mount
- [x] Merge localStorage with Supabase (Supabase wins for conflicts)
- [x] Refetch from Supabase on window focus
- [x] Added `syncError` state and `dismissSyncError` function
- [x] Error reporting on all sync operations

### What's NOT Done (Future Enhancement)
- [ ] After agent completes: Refetch task from Supabase (agent wins)
- [ ] Rollback on sync failure (currently just reports error)
- [ ] Toast notification UI for sync errors (syncError state available)

### Current Data Flow (IMPLEMENTED)
```
Page Load
    ↓
Load localStorage immediately (instant display)
    ↓
Fetch from Supabase
    ↓
Merge with localStorage (Supabase wins for conflicts)
    ↓
Update localStorage + React state
    ↓
Render

Window Focus
    ↓
Refetch from Supabase
    ↓
Merge and update state (cross-device sync)

User Action
    ↓
Optimistic Update (React state + localStorage)
    ↓
Sync to Supabase
    ↓
Success → Done
Error → Set syncError state (rollback not yet implemented)
```

---

## Phase 2: PWA Setup

Make the web app installable on iOS home screen (works without App Store).

### Web Manifest
- [ ] Create `/public/manifest.json`
- [ ] Add manifest link to `/app/layout.tsx`
- [ ] Create app icons (192x192, 512x512)

### Service Worker (Skip for MVP)
Service workers don't work in Capacitor WebView anyway.

### iOS Meta Tags
- [ ] Add to `/app/layout.tsx`:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```
- [ ] Create apple-touch-icon.png (180x180)

### Test PWA
- [ ] Open on iOS Safari
- [ ] Tap Share → "Add to Home Screen"
- [ ] Launch from home screen (should open without Safari UI)

---

## Phase 3: Capacitor iOS App

Wrap the web app in a native iOS shell for App Store distribution.

### Setup
- [ ] Install Capacitor
- [ ] Initialize Capacitor
- [ ] Add iOS platform

### Configure for Next.js
- [ ] Option B recommended: Load from server URL (always up to date)

### iOS Project Setup
- [ ] Open in Xcode
- [ ] Set Bundle Identifier
- [ ] Configure signing
- [ ] Add app icons
- [ ] Add splash screen

### Build & Test
- [ ] Build: `npx cap build ios`
- [ ] Run in Simulator: `npx cap run ios`
- [ ] Test on physical device
- [ ] **Test OAuth login in WKWebView** - Verify cookies persist after Google OAuth redirect
- [ ] **Test session persistence** - Close app, reopen, verify still logged in

---

## Phase 4: Verification

### Web Cross-Device Tests
- [ ] Add task on desktop → refresh on mobile web → appears
- [ ] Complete task on mobile → switch to desktop tab → shows completed
- [ ] Run agent on desktop → status updates visible on mobile after refresh

### iOS App Tests
- [ ] Launch iOS app → same tasks as web
- [ ] Add task in iOS app → appears on web
- [ ] Complete task on web → refresh iOS app → shows completed
- [ ] Run agent in iOS app → works correctly

### Edge Cases
- [ ] Edit title while agent running → title preserved, agent status wins
- [ ] Offline behavior: graceful error toast (no offline queue for MVP)
- [ ] Auth token expiry handling
- [ ] **iOS Safari "Prevent Cross-Site Tracking"** - Verify doesn't break auth in PWA/Capacitor

---

## Files Summary

### Completed Files
| File | Purpose | Status |
|------|---------|--------|
| `/supabase/migrations/009_task_source_steps.sql` | Add `source`, `agent_steps_summary` columns | **DONE** |
| `/app/api/tasks/route.ts` | GET list, POST create | **DONE** |
| `/app/api/tasks/[taskId]/route.ts` | GET, PUT, DELETE (hard delete) | **DONE** |
| `/lib/supabase/types.ts` | Full 10-value TaskStatus enum + new columns | **DONE** |
| `/lib/types.ts` | `toSupabaseTask()` and `fromSupabaseTask()` converters | **DONE** |
| `/app/api/tasks/sync/route.ts` | Updated to use converters for full field sync | **DONE** |
| `/app/api/auth/[...nextauth]/route.ts` | Capacitor-compatible cookie config | **DONE** |
| `/hooks/useTasks.ts` | Sync to Supabase on all write operations | **DONE** |
| `/app/api/tasks/[taskId]/confirm/route.ts` | Audit log sanitized (no user data) | **DONE** |
| `/app/api/tasks/[taskId]/cancel/route.ts` | Audit log sanitized (no user data) | **DONE** |

### Completed Files (Phase 1D - 2026-02-13)
| File | Purpose | Status |
|------|---------|--------|
| `/hooks/useTasks.ts` | Fetch from Supabase on mount, refetch on focus, Supabase as source of truth | **DONE** |
| `/app/api/auth/[...nextauth]/route.ts` | Added `path: '/'` to cookie config (fixed signOut bug) | **DONE** |

### Pending Files (Later Phases)
| File | Purpose | Phase |
|------|---------|-------|
| `/lib/sync/taskSync.ts` | Optional: Extract sync utilities | 1C |
| `/public/manifest.json` | PWA manifest | 2 |
| `/app/layout.tsx` | PWA meta tags | 2 |
| `/capacitor.config.ts` | Capacitor configuration | 3 |
| `/ios/` | Capacitor iOS project (generated) | 3 |

---

## Security Notes

### Audit Log - NO USER DATA
The audit log (`audit_log` table) intentionally does NOT store:
- Task titles or content
- Email bodies or recipients
- Calendar event details
- User-provided feedback text

It only stores:
- User ID (UUID)
- Task ID (UUID)
- Action name (e.g., "draft_confirmed", "task_cancelled")
- Draft ID and type (if applicable)
- Success boolean
- IP address, user agent

### Delete Behavior
- Task delete = **HARD DELETE** (row removed from `tasks` table)
- Cascades to `agent_steps` (ON DELETE CASCADE)
- Cascades to `task_messages` (ON DELETE CASCADE)
- `audit_log` entries preserved with `task_id = NULL`

---

## Not In Scope (MVP)

- Offline queue / sync when back online
- Supabase Realtime subscriptions (using refetch on focus instead)
- Native Swift UI (using web wrapper instead)
- Push notifications (can add later with Capacitor plugin)
- Service worker (doesn't work in Capacitor WebView)

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| iOS approach | Capacitor wrapper | One codebase, faster to ship, Todone doesn't need native UI |
| Supabase access | Direct from web | Simple CRUD, RLS handles security |
| Offline support | None for MVP | Adds complexity, can add later |
| Auth | Keep NextAuth with cookie config | Works in WebView with proper cookie settings |
| Cookie sameSite | `lax` (may need `none` for iOS) | `lax` is default; if WKWebView has issues, switch to `none` + `secure: true` |
| Status mapping | **None - use directly** | Migration 008 added client statuses to DB enum |
| Conflict resolution | Server wins | Use `version` column from migration 008 |
| Delete behavior | **Hard delete** | User expects data to be gone, cascade cleans up related data |
| Audit logging | **IDs only, no user data** | Privacy/compliance requirement |
