# Todone Mobile Plan: Cross-Device Sync → PWA

> **Journey:** Started with Supabase cross-device sync, then tried Capacitor/iOS native OAuth, then pivoted to PWA. Users install via Safari "Add to Home Screen" — standard NextAuth OAuth works as-is, no App Store needed.

**Key Architecture Decisions:**
- **Data**: Supabase is source of truth, localStorage is cache only. Refetch on window focus for cross-device sync.
- **Auth**: Standard NextAuth + Google OAuth. PWAs run in Safari, not a WebView → no JWT/hybrid auth needed.
- **Distribution**: Safari → Add to Home Screen. Service worker for caching/installability.
- **Mobile UX**: Inbox by Gmail aesthetic. Swipe gestures, voice capture, long-press drag reorder.

---

## Phase 0: Cross-Device Sync (Supabase) ✅

> Tasks stored in Supabase as source of truth. localStorage as cache only. All CRUD syncs immediately.

### Completed
- [x] **Schema**: Migration 008 added client statuses to PostgreSQL enum, `version` column, sync indexes
- [x] **Migration 009**: Added `source` column (`user` | `insight`), `agent_steps_summary` (jsonb)
- [x] **Type converters**: `toSupabaseTask()` / `fromSupabaseTask()` in `/lib/types.ts`
- [x] **API endpoints**: `/api/tasks` (GET list, POST create), `/api/tasks/[taskId]` (GET, PUT, DELETE hard-delete)
- [x] **Sync on all writes**: addTask, completeTask, archiveTask, deleteTask, setResearch, togglePin, etc.
- [x] **Fetch on mount**: Load localStorage instantly, then fetch from Supabase and merge (Supabase wins)
- [x] **Refetch on focus**: Window focus triggers Supabase refetch for cross-device sync
- [x] **Delete = hard delete**: Row removed from `tasks`, cascades to `agent_steps` and `task_messages`
- [x] **Audit log sanitized**: No user data stored — only UUIDs, action names, metadata
- [x] **Auth cookie fix**: Added `path: '/'` to NextAuth cookie config (fixed signOut bug)

### Not Done (Future)
- [ ] Rollback on sync failure (errors reported but not rolled back)
- [ ] Toast UI for sync errors (`syncError` state available)
- [ ] Supabase Realtime (currently using refetch-on-focus)

### Key Files
| File | Purpose |
|------|---------|
| `/supabase/migrations/009_task_source_steps.sql` | Source + agent_steps columns |
| `/app/api/tasks/route.ts` | GET list, POST create |
| `/app/api/tasks/[taskId]/route.ts` | GET, PUT, DELETE |
| `/hooks/useTasks.ts` | All sync logic, fetch on mount/focus |
| `/lib/types.ts` | `toSupabaseTask()` / `fromSupabaseTask()` |

---

## Phase 1: Revert Capacitor/iOS Native OAuth ✅

> Removed all Capacitor and native OAuth code. Returned to pure NextAuth web auth.

- [x] Deleted 10 files (JWT, platform detection, mobile auth routes, native auth hook, Capacitor config, `ios/` directory)
- [x] Uninstalled 8 npm packages (Capacitor, social-login, google-auth-library, jsonwebtoken)
- [x] Reverted ~18 modified files (components, hooks, API routes)
- [x] Created `types/next-auth.d.ts` for session type augmentation
- [x] Removed `IOS_GOOGLE_CLIENT_ID` from Vercel
- [x] Build clean, auth works, tasks load, agent streams

---

## Phase 2: Service Worker & Installability ✅

> PWA installable on iOS (Add to Home Screen) and Android (install prompt).

- [x] Installed `@serwist/next` + `serwist`
- [x] Created `app/sw.ts` — precache app shell, **`NetworkOnly` for `/api/*`** (protects SSE streaming)
- [x] Updated `next.config.mjs` with `withSerwist()`, `--webpack` build flag
- [x] Added SW artifacts to `.gitignore`
- [x] Existing PWA infrastructure confirmed: `manifest.json`, icons, `appleWebApp` metadata

---

## Phase 3: Native Feel Enhancements ✅

- [x] `overscroll-behavior: none` in `globals.css`
- [x] `scope` added to `manifest.json`
- [x] All `<a target="_blank">` → `window.open()` (9 components)
- [ ] Apple splash screens (deferred — low priority)

---

## Phase 4: Share Target ("Save to Todone") ✅

- [x] `share_target` in `manifest.json`
- [x] `app/share/page.tsx` — reads shared content, creates task, handles auth redirect

---

## Phase 5: Quick Capture & Bug Fixes ✅

- [x] Fixed task card swipe backgrounds (opaque `bg-[var(--inbox-bg-primary)]`)
- [x] Native app deep links for Gmail (`googlegmail://`) and Calendar (`googlecalendar://`)
- [x] `QuickCaptureBar` — persistent pill-shaped bar above BottomNav
- [x] `FullScreenCapture` — full-screen overlay with slide-up animation, voice input

---

## Phase 6: Mobile UI Polish — "Inbox by Gmail" Feel ✅

- [x] Full-screen task detail (replaced BottomSheet), slide-from-right animation
- [x] Full-screen insights view with consistent back-arrow pattern
- [x] Hover effects scoped to `@media (hover: hover)`, mobile gets `:active` feedback
- [x] Standardized on Inbox tokens (Navigation, QuickCaptureBar, etc.)
- [x] BottomNav badge: red → blue
- [x] Touch targets: 44px minimum (Card padding, CircularCheckbox, gaps)
- [x] InsightBriefingCard: accent tint + blue pill badge
- [x] FullScreenCapture: voice input via Web Speech API, mic FAB + QuickCaptureBar mic icon
- [x] Mobile task flow: save → return to list, agent runs in background

---

## Phase 7: Mobile Interaction Polish — Touch Gestures & Voice ✅

> Fix mobile-specific interaction issues: drag/scroll conflicts, voice capture consistency, swipe-through gestures, and iOS quirks.

### 7.1 Drag-to-reorder ✅
- [x] `@dnd-kit/modifiers` — `restrictToVerticalAxis`
- [x] `TouchSensor` with 250ms delay + 5px tolerance (mobile-only, no `PointerSensor`)
- [x] Long-press anywhere on card to drag (Things 3 / Todoist pattern) — zero visible chrome
- [x] `touch-action: manipulation` on mobile sortable items
- [x] Separate sensor sets: mobile = `TouchSensor` only, desktop = `PointerSensor` + `KeyboardSensor`
- [x] Tried and reverted: visible drag handle (felt like chrome over content)

### 7.2 Swipe gestures (Gmail Inbox style) ✅
- [x] Full-width swipe-through — 40% threshold triggers action with animated slide-off
- [x] Swipe right = complete (green), swipe left = archive (blue)
- [x] Partial swipe below threshold snaps fully back to 0 (no stop at tap target)
- [x] Swipes disabled while `isDragging` (prevents green/blue backgrounds during drag)
- [x] Direction lock: first 10px of movement locks to horizontal (swipe) or vertical (scroll)

### 7.3 iOS quirks ✅
- [x] `-webkit-touch-callout: none` + `user-select: none` suppresses iOS context menu during drag

### 7.4 Voice capture ✅
- [x] State machine: `idle → listening → done` (3 states, single code path)
- [x] Single `startListening()` entry point with double-start guard
- [x] Triple-fallback transcript recovery: `finalTranscriptRef || interimTranscriptRef || bestTextRef`
- [x] `onerror` defers to `onend` for state transition (no race condition)
- [x] iMessage-style done state: auto-growing `<textarea>` bubble + send button
- [x] Full-screen voice zone (hidden text input, centered listening, bottom-pinned done state)

### 7.5 QuickCaptureBar ✅
- [x] Elevated shadow, stronger border, accent ring, medium-weight text

### 7.6 Known Issues (minor, functional)
- Swipe/scroll direction lock could be further tuned for diagonal gestures
- Long-press drag may still occasionally conflict with iOS system gestures
- Voice transcript recovery depends on browser Speech API behavior (varies by device)

---

## Phase 8: Verification & Regression Testing ← NEXT

### 8.1 Web flow (regression)
- [ ] Sign in on desktop browser — NextAuth flow works
- [ ] Tasks load correctly
- [ ] Insight scan works
- [ ] Agent runs work
- [ ] Gmail/Calendar data accessible through agent

### 8.2 PWA flow (iPhone Safari)
- [ ] Add to Home Screen → standalone mode
- [ ] Sign in with Google OAuth → works
- [ ] Tasks load, create, run agent
- [ ] Insight scan works
- [ ] Share from other apps works
- [ ] Sign out and sign back in

### 8.3 Cross-device sync
- [ ] Add task on desktop → appears on mobile after focus switch
- [ ] Complete task on mobile → reflected on desktop after focus switch

### 8.4 Deploy
- [ ] Deploy to Vercel production
- [ ] Verify service worker serves correctly
- [ ] Test PWA install from production URL

---

## Phase 9: Lint Cleanup

> Fix all 56 ESLint warnings across the codebase (pre-existing, not from our changes).

- [ ] Fix all warnings (`no-explicit-any`, `no-unused-vars`, `no-empty-object-type`, hooks rules)
- [ ] Promote warning rules to errors in `eslint.config.mjs`

---

## Architecture

```
┌─────────────────────────────────────────┐
│              User Devices               │
│                                         │
│  Desktop Browser    iPhone PWA          │
│  (Next.js)          (Add to Home Screen)│
│                                         │
│  Standard NextAuth  Same app, Safari    │
│  Google OAuth       engine, OAuth works │
└───────────┬─────────────────┬───────────┘
            │                 │
            │  Supabase sync  │
            │  (source of     │
            │   truth)        │
            ▼                 ▼
      ┌──────────────────────────┐
      │   Supabase (Postgres)    │
      │   + RLS + Audit Log      │
      └──────────────────────────┘
```

| | Capacitor (abandoned) | PWA (current) |
|---|---|---|
| **Distribution** | Xcode → TestFlight/App Store | Safari → Add to Home Screen |
| **OAuth** | Native plugin + JWT + hybrid sessions | Standard NextAuth |
| **Offline** | WebView cache | Service worker cache |
| **Updates** | Rebuild + redeploy native | Instant (SW update) |
| **Share target** | Not implemented | Web Share Target API |
| **Complexity** | High | Low |

---

## Files Created (all phases)

| File | Purpose |
|------|---------|
| `types/next-auth.d.ts` | NextAuth session type augmentation |
| `app/sw.ts` | Service worker entry point |
| `app/share/page.tsx` | Share target handler page |
| `components/QuickCapture.tsx` | QuickCaptureBar + FullScreenCapture + voice input |
| `types/speech.d.ts` | Web Speech API type declarations |
| `supabase/migrations/009_task_source_steps.sql` | Source + agent_steps columns |

## Key Files Modified

| File | Changes |
|------|---------|
| `hooks/useTasks.ts` | Supabase sync on all writes, fetch on mount/focus |
| `app/page.tsx` | Mobile layout (full-screen views, QuickCapture, task flow) |
| `components/TaskCard.tsx` | Swipe gestures, opaque mobile bg, drag handle removed |
| `components/TaskList.tsx` | TouchSensor, restrictToVerticalAxis, touch-action |
| `components/QuickCapture.tsx` | Voice state machine, full-screen voice zone |
| `components/Navigation.tsx` | Inbox tokens, badge color, safe-area header |
| `components/ConversationPanel.tsx` | Mobile header simplification, safe area |
| `next.config.mjs` | `withSerwist()` |
| `public/manifest.json` | `share_target`, `scope` |
| `package.json` | Remove Capacitor deps, add serwist + dnd-kit modifiers |
| 9 components | `<a target="_blank">` → `window.open()` |
| 9 API routes | Reverted `getHybridSession()` → `getServerSession(authOptions)` |

---

## Security Notes

- OAuth tokens encrypted at rest (`ENCRYPTION_SECRET`)
- Row Level Security on all Supabase tables
- Audit log: IDs only, no user data (task titles, email bodies, etc.)
- Delete = hard delete (cascades to agent_steps, task_messages)
- Never store full email/event content, only summaries

## Not In Scope (MVP)

- Offline queue / sync when back online
- Supabase Realtime subscriptions (using refetch-on-focus)
- Push notifications
- Apple splash screens
- App Store distribution
