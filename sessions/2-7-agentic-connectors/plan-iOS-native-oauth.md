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
- [ ] Remove `IOS_GOOGLE_CLIENT_ID` from Vercel dashboard

### 1.4 Verification ✅
- [x] `npm run lint` — 0 errors (55 pre-existing warnings)
- [x] `npm run typecheck` — clean
- [x] `npm run build` — clean
- [ ] App loads, Google sign-in works in browser
- [ ] Tasks load and display correctly
- [ ] Insight scan works
- [ ] Agent runs and streams progress (SSE regression check)

---

## Phase 2: Service Worker & Installability

> Make the app installable on iOS (Add to Home Screen) and Android (PWA install prompt). The app already has `manifest.json`, icons, and `appleWebApp` metadata in `layout.tsx`.

### 2.1 Install service worker tooling

- [ ] `npm install @serwist/next serwist`
  > `@serwist/next` is the modern replacement for `next-pwa`, with Next.js 14+ support

### 2.2 Create service worker entry point

- [ ] Create `app/sw.ts`
  - Precache app shell and static assets
  - Runtime caching: StaleWhileRevalidate for pages/static assets
  - **Critical: `NetworkOnly` for `/api/*` routes** — the app uses SSE streaming for agent execution (`/api/tasks/[taskId]/run`). If the service worker caches or intercepts these, streaming will break.
  - Skip waiting + claim clients for instant activation

### 2.3 Update Next.js config

- [ ] Update `next.config.mjs`
  - Wrap existing config with `withSerwist()` to generate service worker at build time
  - Disable service worker in dev mode to avoid caching issues

### 2.4 Update .gitignore

- [ ] Add service worker build artifacts:
  ```
  # PWA Service Worker (generated at build time)
  public/sw.js
  public/swe-worker-*.js
  public/workbox-*.js
  ```

### 2.5 Verify existing PWA infrastructure

Already in place (no changes needed):
- `public/manifest.json` — name, icons (192px, 512px, SVG), `display: standalone`
- `app/layout.tsx` — `manifest` link, `appleWebApp` metadata
- `public/icons/` — apple-touch-icon.png, icon-192.png, icon-512.png, icon.svg

### 2.6 Testing
- [ ] Chrome DevTools → Application → Manifest → no warnings
- [ ] Chrome DevTools → Application → Service Workers → registered
- [ ] Chrome shows install prompt (address bar icon)
- [ ] iPhone Safari → Share → "Add to Home Screen" → opens in standalone mode
- [ ] Google OAuth sign-in works in standalone PWA mode
- [ ] Agent SSE streaming still works (run a task, verify progress updates)

---

## Phase 3: Native Feel Enhancements

> Make the PWA feel like a native app, not a website in disguise.

### 3.1 Disable overscroll bounce

- [ ] Add to `globals.css`:
  ```css
  html, body {
    overscroll-behavior: none;
  }
  ```
  Prevents the rubber-band bounce when scrolling past edges.

### 3.2 Apple splash screens

- [ ] Add `apple-touch-startup-image` link tags to `app/layout.tsx`
  - Generate splash images for key device sizes (iPhone 15 Pro Max, 15/14, SE, iPad)
  - Uses app icon + theme color to prevent white flash on launch

### 3.3 Standalone navigation handling

- [ ] Add `scope` to `manifest.json` to prevent accidental navigation out of app
- [ ] Convert external `<a target="_blank">` links to `window.open()` for standalone PWA mode:
  - `components/EmailDraftCard.tsx` — URLs in email body
  - `components/ui/Markdown.tsx` — markdown links
  - `components/insight/InsightDetailPanel.tsx` — email URLs
  - `components/SourceBadge.tsx` — source verification links
  - Already correct (no changes needed): `CalendarDraftCard.tsx`, `ActionButton.tsx`, `lib/utils/gmail-compose.ts`, `lib/email/gmail-links.ts`
- [ ] Audit remaining components for `<a>` tags with external URLs: `KeyFactsLine.tsx`, `QuickReferenceCard.tsx`, `OptionCard.tsx`, `TaskContextPanel.tsx`, `DetailPanel.tsx`

### 3.4 Testing
- [ ] No overscroll bounce when scrolling past content
- [ ] App shows splash screen on launch (no white flash)
- [ ] Tapping internal links stays within the PWA
- [ ] Tapping "Reply in Gmail" / "Create in Calendar" opens Safari overlay
- [ ] Back navigation works within the app
- [ ] Existing features still work (tasks, scan, agent)

---

## Phase 4: Share Target ("Save to Todone")

> Let users share URLs/text from any app (Safari, Mail, etc.) into Todone as a new task.

### 4.1 Add share_target to manifest

- [ ] Update `public/manifest.json`:
  ```json
  "share_target": {
    "action": "/share",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
  ```

### 4.2 Create share target page

- [ ] Create `app/share/page.tsx`
  - Reads `title`, `text`, `url` from search params
  - User must be signed in (redirect to login if not)
  - Creates a new task pre-populated with the shared content
  - Shows the task inline or redirects to home after creation

### 4.3 Testing
- [ ] Install PWA on iPhone
- [ ] Open Safari → navigate to any webpage → Share → "Todone" appears in sheet
- [ ] Select Todone → app opens with URL/title pre-populated as new task
- [ ] From Mail app → share an email link → same flow works
- [ ] Share while not signed in → redirects to login → then creates task

---

## Phase 5: Verification & Regression Testing

### 5.1 Web flow (regression)

- [ ] Sign in on desktop browser — NextAuth flow works
- [ ] Tasks load correctly
- [ ] Insight scan works
- [ ] Agent runs work
- [ ] Gmail/Calendar data accessible through agent

### 5.2 PWA flow (iPhone Safari)

- [ ] Add to Home Screen → standalone mode
- [ ] Sign in with Google OAuth → works (no WebView issues)
- [ ] Tasks load, create, run agent
- [ ] Insight scan works
- [ ] Share from other apps works
- [ ] Sign out and sign back in

### 5.3 Deploy

- [ ] Deploy to Vercel
- [ ] Verify service worker serves correctly in production
- [ ] Test PWA install from production URL

---

## Phase 6: Lint Cleanup

> Fix all 55 pre-existing ESLint warnings across the codebase. These are not from our PWA changes — they existed before ESLint was properly configured.

### Categories of warnings (55 total):
- `@typescript-eslint/no-explicit-any` — replace `any` with proper types
- `@typescript-eslint/no-unused-vars` — remove unused imports/variables
- `@typescript-eslint/no-empty-object-type` — use `Record<string, never>` or proper type
- `react-hooks/set-state-in-effect` — refactor setState calls in effects
- `react-hooks/preserve-manual-memoization` — fix memoization patterns

### Goal:
- [ ] Fix all 55 warnings so `npm run lint` produces 0 problems
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

## Files to Create (New)

| File | Purpose |
|------|---------|
| `types/next-auth.d.ts` | NextAuth session type augmentation (Phase 1) ✅ |
| `app/sw.ts` | Service worker entry point (Phase 2) |
| `app/share/page.tsx` | Share target handler page (Phase 4) |

## Files to Modify

| File | Changes |
|------|---------|
| `next.config.mjs` | Wrap with `withSerwist()` |
| `public/manifest.json` | Add `share_target` and `scope` |
| `app/globals.css` | Add `overscroll-behavior: none` |
| `app/layout.tsx` | Add apple splash screen link tags |
| `.gitignore` | Add SW build artifacts |
| `components/EmailDraftCard.tsx` | `<a>` → `window.open()` |
| `components/ui/Markdown.tsx` | `<a>` → `window.open()` |
| `components/insight/InsightDetailPanel.tsx` | `<a>` → `window.open()` |
| `components/SourceBadge.tsx` | `<a>` → `window.open()` |
