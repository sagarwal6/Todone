# Mobile App Plan: Capacitor → PWA

> **Direction Change:** Originally implemented native iOS OAuth via Capacitor to bypass WebView OAuth restrictions. Decided to switch to a Progressive Web App (PWA) instead — users install via Safari's "Add to Home Screen", OAuth works natively in Safari (no WebView), no App Store needed.

**Key Architecture Decision:**
- PWAs run in Safari, not a WebView → standard NextAuth Google OAuth works as-is
- No need for JWT mobile auth, hybrid sessions, or native plugins
- Service worker enables offline caching, installability, and share target

---

## Phase 1: Revert Capacitor/iOS Native OAuth ✅

> Remove all Capacitor and native OAuth code. Return the app to pure NextAuth web auth.

### 1.0 Delete files created for Capacitor/native auth ✅
- [x] `lib/utils/jwt.ts` — JWT signing/verification for mobile sessions
- [x] `lib/utils/platform.ts` — Platform detection (native vs web)
- [x] `lib/utils/api.ts` — API fetch wrapper with auth headers
- [x] `lib/auth/getSession.ts` — Hybrid session helper (NextAuth + JWT)
- [x] `app/api/auth/mobile/route.ts` — Mobile sign-in endpoint
- [x] `app/api/auth/mobile/refresh/route.ts` — Token refresh endpoint
- [x] `app/api/auth/mobile/logout/route.ts` — Mobile logout endpoint
- [x] `hooks/useNativeAuth.ts` — Native auth hook for iOS
- [x] `capacitor.config.ts` — Capacitor configuration
- [x] `ios/` — Entire iOS native project directory

### 1.1 Remove Capacitor dependencies ✅
- [x] `@capacitor/browser`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`
- [x] `@capgo/capacitor-social-login`
- [x] `google-auth-library`, `jsonwebtoken`, `@types/jsonwebtoken`

### 1.2 Revert modified files to pre-Capacitor state ✅
- [x] `components/AuthProvider.tsx` — removed SocialLogin initialization
- [x] `components/LoginScreen.tsx` — removed native auth branching
- [x] `components/Navigation.tsx` — removed native sign-out prop
- [x] `app/page.tsx` — removed mobileUser/isNative state
- [x] `hooks/useInsightScan.ts` — reverted `apiFetch()` → `fetch()`
- [x] `hooks/useTasks.ts` — reverted `apiFetch()` → `fetch()`
- [x] `contexts/AgentContext.tsx` — removed `getAuthHeaders()` from fetch calls
- [x] All API routes — reverted `getHybridSession()` → `getServerSession(authOptions)`
- [x] Created `types/next-auth.d.ts` — NextAuth session type augmentation (adds `user.id`)

### 1.3 Remove environment variable (manual)
- [x] Remove `IOS_GOOGLE_CLIENT_ID` from Vercel dashboard

### 1.4 Verification ✅
- [x] `npm run lint` — 0 errors (55 pre-existing warnings)
- [x] `npm run typecheck` — clean
- [x] `npm run build` — clean
- [x] App loads, Google sign-in works in browser
- [x] Tasks load and display correctly
- [x] Insight scan works
- [x] Agent runs and streams progress (SSE regression check)

---

## Phase 2: Service Worker & Installability ✅

> Make the app installable on iOS (Add to Home Screen) and Android (PWA install prompt). The app already has `manifest.json`, icons, and `appleWebApp` metadata in `layout.tsx`.

### 2.1 Install service worker tooling ✅

- [x] `npm install @serwist/next serwist`

### 2.2 Create service worker entry point ✅

- [x] Created `app/sw.ts`
  - Precache app shell and static assets
  - **`NetworkOnly` for `/api/*` routes** — protects SSE streaming
  - Default caching for pages/static assets
  - Skip waiting + claim clients for instant activation

### 2.3 Update Next.js config ✅

- [x] Updated `next.config.mjs` — wrapped with `withSerwist()`
- [x] Disabled SW in dev mode
- [x] Build uses `--webpack` flag (serwist's Turbopack support is experimental)
- [x] Added `"webworker"` lib and `@serwist/next/typings` to `tsconfig.json`

### 2.4 Update .gitignore ✅

- [x] Added `public/sw.js`, `public/swe-worker-*.js`, `public/workbox-*.js`

### 2.5 Verify existing PWA infrastructure ✅

Already in place (no changes needed):
- `public/manifest.json` — name, icons (192px, 512px, SVG), `display: standalone`
- `app/layout.tsx` — `manifest` link, `appleWebApp` metadata
- `public/icons/` — apple-touch-icon.png, icon-192.png, icon-512.png, icon.svg

### 2.6 Verification ✅
- [x] `npm run lint` — 0 errors (55 pre-existing warnings)
- [x] `npm run typecheck` — clean
- [x] `npm run build` — clean, SW bundled at `/sw.js`
- [ ] Chrome DevTools → Application → Manifest → no warnings
- [ ] Chrome DevTools → Application → Service Workers → registered
- [ ] Chrome shows install prompt (address bar icon)
- [ ] iPhone Safari → Share → "Add to Home Screen" → opens in standalone mode
- [ ] Google OAuth sign-in works in standalone PWA mode
- [ ] Agent SSE streaming still works (run a task, verify progress updates)

---

## Phase 3: Native Feel Enhancements ✅

> Make the PWA feel like a native app, not a website in disguise.

### 3.1 Disable overscroll bounce ✅

- [x] Added `overscroll-behavior: none` to `globals.css`

### 3.2 Apple splash screens

- [ ] Add `apple-touch-startup-image` link tags to `app/layout.tsx`
  - Generate splash images for key device sizes (iPhone 15 Pro Max, 15/14, SE, iPad)
  - Uses app icon + theme color to prevent white flash on launch
  - *Deferred — low priority, can add later*

### 3.3 Standalone navigation handling ✅

- [x] Added `scope` to `manifest.json` to prevent accidental navigation out of app
- [x] Converted all `<a target="_blank">` links to `window.open()` for standalone PWA mode:
  - `components/EmailDraftCard.tsx` — URLs in email body
  - `components/ui/Markdown.tsx` — markdown links
  - `components/insight/InsightDetailPanel.tsx` — email URLs
  - `components/SourceBadge.tsx` — source verification links
  - `components/QuickReferenceCard.tsx` — website links
  - `components/KeyFactsLine.tsx` — website links
  - `components/DetailPanel.tsx` — website links
  - `components/TaskContextPanel.tsx` — website links
  - `components/OptionCard.tsx` — action URLs
  - Already correct (no changes needed): `CalendarDraftCard.tsx`, `ActionButton.tsx`, `lib/utils/gmail-compose.ts`, `lib/email/gmail-links.ts`
- [x] Zero `target="_blank"` remaining in any component

### 3.4 Testing
- [ ] No overscroll bounce when scrolling past content
- [ ] Tapping internal links stays within the PWA
- [ ] Tapping "Reply in Gmail" / "Create in Calendar" opens native app (via Universal Links) or Safari
- [ ] Back navigation works within the app
- [ ] Existing features still work (tasks, scan, agent)

---

## Phase 4: Share Target ("Save to Todone") ✅

> Let users share URLs/text from any app (Safari, Mail, etc.) into Todone as a new task.

### 4.1 Add share_target to manifest ✅

- [x] Updated `public/manifest.json` with `share_target` config

### 4.2 Create share target page ✅

- [x] Created `app/share/page.tsx`
  - Reads `title`, `text`, `url` from search params
  - Redirects to Google sign-in if not authenticated (preserves share params)
  - Shows source URL preview with clickable link back to source
  - Editable task title composed from shared content (preserves URL)
  - Creates task via API, shows success animation, redirects to home
  - Wrapped in Suspense for Next.js static rendering compatibility

### 4.3 Testing
- [ ] Install PWA on iPhone
- [ ] Open Safari → navigate to any webpage → Share → "Todone" appears in sheet
- [ ] Select Todone → app opens with URL/title pre-populated as new task
- [ ] Source URL is clickable in the share page UI
- [ ] From Mail app → share an email link → same flow works
- [ ] Share while not signed in → redirects to login → then creates task

---

## Phase 5: Mobile UX — Quick Capture & Bug Fixes

> Make the mobile PWA feel native. Fix visual bugs found during testing, add native app deep links, and replace the FAB + BottomSheet task input with a persistent quick capture bar + full-screen input.

### 5.1 Fix task card swipe backgrounds visible on mobile ✅

- [x] Task cards used `bg-transparent` (flat Card variant) which let the swipe action backgrounds (blue archive / red delete) show through
- [x] Added opaque `bg-[var(--inbox-bg-primary)]` to TaskCard when `isMobile`

### 5.2 Add native app deep links for Gmail & Calendar ✅

- [x] Updated `openGmailThread` — tries `googlegmail:///mail/thread/{threadId}` first on mobile, falls back to web URL
- [x] Updated `openGmailCompose` and `openGmailReply` — uses shared `openNativeAppWithFallback` helper
- [x] Updated `CalendarDraftCard` — tries `googlecalendar://` scheme on mobile, falls back to web URL
- [x] Created shared `openNativeAppWithFallback()` helper in `lib/email/gmail-links.ts`

### 5.3 Quick Capture — Persistent Input Bar + Full-Screen Capture

> Replace the FAB + BottomSheet pattern with a persistent input bar + full-screen task creation view. Reduces task capture from 3 taps to 1 tap.

**Design pattern:** Same as Todoist, Google Tasks, Apple Reminders — persistent "Add a task" bar, tapping opens full-screen input.

#### 5.3.1 Create `QuickCaptureBar` component ✅

- [x] Persistent pill-shaped bar docked above BottomNav
  - `[+ Add a task...]` — always visible on all tabs
  - Position: fixed, above BottomNav (`bottom: calc(4rem + env(safe-area-inset-bottom))`)
  - Background: `surface-container-high`, `rounded-xl`, `shadow-inbox-elevated`
  - Icon: `add_circle` filled, 24px, `text-primary`
  - Tapping opens the full-screen capture view

#### 5.3.2 Create `FullScreenCapture` component ✅

- [x] Full-screen overlay that slides up from bottom (300ms ease-decelerate)
  - **Header**: back arrow | "New task" | Save button
  - **Input area**: guiding label "What do you need to get done?"
  - **Textarea**: large 24px text, auto-focused, keyboard opens immediately
  - **Placeholder**: `e.g. "Reply to Sarah about the Q3 budget review"`
  - **Save**: creates task, slides down (250ms), task appears in list
  - **Back**: slides down, discards input (no confirmation — quick capture is disposable)
  - Portal to `document.body`, `z-50`, covers everything including BottomNav
  - Body scroll locked while open
  - `Cmd+Enter` / `Ctrl+Enter` keyboard shortcut for save (iPad)

#### 5.3.3 Update `page.tsx` mobile layout ✅

- [x] Remove FAB + "Add Task" BottomSheet from mobile layout
- [x] Remove `showAddTaskModal` state
- [x] Add `QuickCaptureBar` above `BottomNav`
- [x] Add `FullScreenCapture` with `showCapture` state
- [x] Increase main content bottom padding from `pb-20` to `pb-32` to clear both bar and nav
- [x] Also add QuickCaptureBar to Insights view layout

#### 5.3.4 Testing

- [ ] QuickCaptureBar visible on all tabs (active, completed, archived, insights)
- [ ] Tapping bar opens full-screen capture with keyboard
- [ ] Typing + Save creates task, full-screen closes, task appears at top
- [ ] Back arrow dismisses without confirmation
- [ ] Keyboard behaves correctly in iOS PWA standalone mode
- [ ] Desktop layout unchanged (still uses inline TaskInput)
- [ ] Task detail panel still works after creating a task

---

## Phase 6: Mobile UI Polish — "Inbox by Gmail" Feel ✅

> Deep design audit revealed the mobile UI feels like a responsive desktop site, not a native app. These changes bring it to Inbox by Gmail quality: proper full-screen navigation, consistent tokens, generous touch targets, and smooth transitions.

### 6.0 Fix swipe background rendering ✅

- [x] Only render swipe action backgrounds when user is actively swiping (`swipeOffset !== 0`)
- [x] Fixed Tailwind specificity issue — `!important` override for opaque card background
- [x] Swipe right = done (green), swipe left = archive (blue)
- [x] Removed checkboxes on mobile — swipe gestures replace them

### 6.1 Full-screen task detail on mobile (P0) ✅

- [x] Replaced BottomSheet with full-screen view (`fixed inset-0 z-50`)
- [x] Slide-from-right animation (300ms, MD3 emphasized decelerate)
- [x] Detail header: back arrow | task title (truncated)
- [x] ConversationPanel simplified on mobile: hidden title/close, tighter padding, safe-area bottom
- [x] Full-screen insights view with consistent back-arrow pattern

### 6.2 Scope hover effects to desktop only (P1) ✅

- [x] `.task-card:hover` transform/shadow wrapped in `@media (hover: hover)`
- [x] `.task-card:active` state for mobile touch feedback (50ms transition)

### 6.3 Standardize on Inbox tokens (P1) ✅

- [x] MobileHeader: `bg-surface` → `bg-inbox-bg-primary`, inbox tokens throughout
- [x] MobileHeader padding: `pt-[max(1rem,env(safe-area-inset-top))]`
- [x] BottomNav: `bg-surface-container` → `bg-inbox-bg-primary`, inbox tokens
- [x] QuickCaptureBar: inbox tokens, `border border-inbox-divider`, `rounded-2xl`

### 6.4 Fix BottomNav badge color (P1) ✅

- [x] Badge: `bg-error text-on-error` (red) → `bg-inbox-accent text-white` (blue)

### 6.5 Increase touch targets and spacing (P1) ✅

- [x] `Card.tsx` — base padding `px-4 py-3.5` (user feedback: py-4 was too much)
- [x] `TaskCard.tsx` — gap `gap-2` → `gap-3`
- [x] `CircularCheckbox.tsx` — 44px min touch target with inner visual circle

### 6.6 Visual polish (P2) ✅

- [x] `InsightBriefingCard.tsx` — accent tint + blue pill badge
- [x] Tab cross-fade with `key={viewMode}` on `<main>`
- [x] FullScreenCapture redesigned: single-line input, check circle icon, Enter to save

### 6.7 FullScreenCapture color palette & voice input ✅

- [x] Background: `bg-surface-bright` (pure white) instead of cold gray
- [x] Header: `bg-inbox-bg-secondary/50` tint, "New task" in blue, close X icon
- [x] Check circle: muted blue (`text-primary/25`) empty state, pops to full blue + scale on typing
- [x] Save button: scale animation (95% → 100%) + color transition when text entered
- [x] Hint text: `text-xs` at `/40` opacity — subtle, doesn't compete
- [x] Placeholder: "What can I help you with?" — signals AI assistant
- [x] Focus underline: `border-primary/40` for visible active state
- [x] Voice input FAB (56px blue mic, bottom-right) with Web Speech API
- [x] Mic icon on QuickCaptureBar — 1-tap voice capture without opening overlay first
- [x] `startWithVoice` prop auto-starts recording when opened via mic tap
- [x] Pulse animation while recording, "Listening..." badge, red stop button
- [x] Graceful fallback: mic hidden if Speech API unavailable

### 6.8 Mobile task creation flow ✅

- [x] After saving a task on mobile, returns to task list (not task detail)
- [x] Agent starts in background — "Working..." spinner shows on task card
- [x] QuickCaptureBar immediately available for adding another task
- [x] Desktop flow unchanged (opens task detail panel after creation)

### 6.9 Testing

- [ ] Task detail opens full-screen with slide-from-right animation
- [ ] Back arrow returns to task list
- [ ] No hover lift on mobile touch, instant active feedback instead
- [ ] Swipe right = done, swipe left = archive (no checkboxes on mobile)
- [ ] Consistent Inbox token usage — no MD3 generic tokens on mobile
- [ ] BottomNav badges are blue, not red
- [ ] Touch targets are 44px minimum
- [ ] Add task → returns to list, agent runs in background
- [ ] Voice input works via mic FAB and QuickCaptureBar mic icon
- [ ] Desktop layout unchanged — still uses side panel, hover effects, etc.

---

## Phase 7: Verification & Regression Testing

### 7.1 Web flow (regression)

- [ ] Sign in on desktop browser — NextAuth flow works
- [ ] Tasks load correctly
- [ ] Insight scan works
- [ ] Agent runs work
- [ ] Gmail/Calendar data accessible through agent

### 7.2 PWA flow (iPhone Safari)

- [ ] Add to Home Screen → standalone mode
- [ ] Sign in with Google OAuth → works (no WebView issues)
- [ ] Tasks load, create, run agent
- [ ] Insight scan works
- [ ] Share from other apps works
- [ ] Sign out and sign back in

### 7.3 Deploy

- [ ] Deploy to Vercel
- [ ] Verify service worker serves correctly in production
- [ ] Test PWA install from production URL

---

## Phase 8: Lint Cleanup

> Fix all 56 ESLint warnings across the codebase. These are not from our PWA changes — they existed before ESLint was properly configured.

### Categories of warnings (56 total):
- `@typescript-eslint/no-explicit-any` — replace `any` with proper types
- `@typescript-eslint/no-unused-vars` — remove unused imports/variables
- `@typescript-eslint/no-empty-object-type` — use `Record<string, never>` or proper type
- `react-hooks/set-state-in-effect` — refactor setState calls in effects
- `react-hooks/preserve-manual-memoization` — fix memoization patterns

### Goal:
- [ ] Fix all 56 warnings so `npm run lint` produces 0 problems
- [ ] Promote warning rules to errors in `eslint.config.mjs` to prevent regressions

---

## Architecture Comparison

| | Capacitor (old) | PWA (new) |
|---|---|---|
| **Distribution** | Xcode build → TestFlight/App Store | Safari → Add to Home Screen |
| **OAuth** | Native plugin + JWT + hybrid sessions | Standard NextAuth (works in Safari) |
| **Offline** | WebView cache | Service worker cache |
| **Updates** | Rebuild + redeploy native app | Instant (service worker update) |
| **Share target** | Not implemented | Web Share Target API |
| **Complexity** | High (native code, dual auth, Xcode) | Low (web-only, single auth path) |
| **App Store** | Possible | Not available |

---

## Files Created

| File | Purpose |
|------|---------|
| `types/next-auth.d.ts` | NextAuth session type augmentation (Phase 1) ✅ |
| `app/sw.ts` | Service worker entry point (Phase 2) ✅ |
| `app/share/page.tsx` | Share target handler page (Phase 4) ✅ |
| `components/QuickCapture.tsx` | QuickCaptureBar + FullScreenCapture + voice input (Phase 5/6) ✅ |
| `types/speech.d.ts` | Web Speech API type declarations (Phase 6) ✅ |

## Files Modified

| File | Changes |
|------|---------|
| `next.config.mjs` | Wrap with `withSerwist()` ✅ |
| `public/manifest.json` | Add `share_target`, `scope` ✅ |
| `app/globals.css` | Add `overscroll-behavior: none` ✅ |
| `.gitignore` | Add SW build artifacts ✅ |
| `tsconfig.json` | Add `webworker` lib, serwist typings ✅ |
| `eslint.config.mjs` | Add `next.config.mjs` to ignores ✅ |
| `package.json` | Remove Capacitor deps, add serwist, `--webpack` build flag ✅ |
| 9 components | `<a target="_blank">` → `window.open()` ✅ |
| 7 components/hooks | Revert native auth code ✅ |
| 9 API routes | `getHybridSession()` → `getServerSession(authOptions)` ✅ |
| `components/TaskCard.tsx` | Opaque background on mobile to hide swipe actions ✅ |
| `lib/email/gmail-links.ts` | Native app deep links + `openNativeAppWithFallback` helper ✅ |
| `lib/utils/gmail-compose.ts` | Use native app deep links on mobile ✅ |
| `components/CalendarDraftCard.tsx` | Use native Calendar app deep link on mobile ✅ |
| `app/page.tsx` | Remove FAB + BottomSheet, add QuickCapture (Phase 5), full-screen views, mobile task flow (Phase 6) ✅ |
| `app/globals.css` | Slide animation, hover scoping, mic pulse animation (Phase 6) ✅ |
| `components/Navigation.tsx` | Inbox token alignment, badge color fix, safe-area header (Phase 6) ✅ |
| `components/ConversationPanel.tsx` | Mobile header simplification, safe area (Phase 6) ✅ |
| `components/TaskCard.tsx` | Swipe gestures (done/archive), remove mobile checkboxes (Phase 6) ✅ |
| `components/ui/Card.tsx` | Padding adjustment `py-3.5` (Phase 6) ✅ |
| `components/ui/CircularCheckbox.tsx` | 44px touch target (Phase 6) ✅ |
| `components/insight/InsightBriefingCard.tsx` | Accent tint + blue pill badge (Phase 6) ✅ |
