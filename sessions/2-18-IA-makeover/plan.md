# Session 2-18: Information Architecture Makeover

## Status
- **All phases complete**
- **Branch**: `feature/ia-makeover`

## Context

Todone has two products merged into one UI:
1. **Task list** — user-initiated tasks that the AI agent researches and executes
2. **Proactive intelligence (Briefing)** — system-initiated scanning of inbox/calendar for meetings to prep and emails to respond to

These have different mental models (pull vs. push). The IA makeover restructured navigation, renamed concepts, and added polish animations.

## Current Design Decisions

1. **Briefing is a card at the top of the task list** — `InsightBriefingCard` is the first row when viewing active tasks. Clicking it navigates to the full InsightView. A back arrow returns to the task list. This was chosen over header/pill toggles (tried and reverted in Phase 6) because the card is more discoverable.
2. **Header is simple branding** — Mobile and desktop both show `[task_alt] Todone` in the header. No mode toggle in the header.
3. **"Archived" renamed to "Someday"** — GTD Someday/Maybe semantics. Data model changed, DB migration applied.
4. **Someday + Completed** — Both accessible from the overflow/account menu (no counts shown), not promoted in the main UI.
5. **Completion animation** — SVG checkmark draw, card slide-out, FLIP row collapse. Satisfying micro-ceremony since "Completed" is no longer a visible tab.
6. **Empty state "dawn" animation** — Staggered sun ray entry, rotating messages, idle rotation when all tasks are done.
7. **3-pane layout eliminated** — Each mode is strictly 1-pane or 2-pane (task list + detail panel).
8. **Scan progress UX** — Rotating contextual messages during the analyzing phase (timer-based, 2.5s cycle) with a time-based asymptotic progress bar. No LLM streaming (tried and reverted — Haiku is too fast for intermediate states to render).
9. **Keyboard shortcuts** — `Cmd/Ctrl+1` = Tasks, `Cmd/Ctrl+2` = Briefing.

---

## Phase 1: Data Model — Rename `archived` to `someday` ✅

- [x] `lib/types.ts` — `TaskStatus`: `'archived'` → `'someday'`
- [x] `hooks/useTasks.ts` — `archivedTasks`/`archiveTask` → `somedayTasks`/`somedayTask`
- [x] `app/page.tsx` — ViewMode, counts, all references updated
- [x] `components/TaskCard.tsx` — Swipe left = Someday (amber + schedule icon)
- [x] `components/CompactTaskCard.tsx` — Same renames
- [x] `components/ConversationPanel.tsx` — Menu: "Move to Someday"
- [x] `components/TaskList.tsx` — Prop renames
- [x] `components/EmptyState.tsx` — Updated empty state text
- [x] `components/Navigation.tsx` — ViewMode type, navItems
- [x] `supabase/migrations/012_rename_archived_to_someday.sql` — DB enum migration (old 'archived' value remains in enum but unused)
- [x] `lib/tasks.ts`, API routes — All `'archived'` references updated

---

## Phase 2: Navigation Restructure ✅

Removed bottom nav tabs entirely. Replaced with:
- **Mobile**: Simple "Todone" header + overflow menu with Completed/Someday
- **Desktop**: Simple "Todone" header + overflow menu with Completed/Someday
- **Both**: Briefing accessed via `InsightBriefingCard` in the task list (not a header toggle)
- Completed/someday views show a "← Back to tasks" button

Changes:
- [x] `components/Navigation.tsx` — Removed `BottomNav`, rewrote `MobileHeader` (simple branding, no toggle), simplified `DesktopAccountMenu` (no counts)
- [x] `app/page.tsx` — Removed bottom nav, removed pill toggle, added `InsightBriefingCard` above TaskList, added back buttons for insights/completed/someday views

> **History**: Phase 2 originally added a Tasks/Briefing toggle in the mobile header and a pill toggle on desktop. Phase 6 reverted this because the toggles were too hidden — users didn't discover Briefing. The card-in-list approach is more discoverable.

---

## Phase 3: Completion Animation ✅

- [x] `components/ui/CircularCheckbox.tsx` — SVG checkmark with stroke-draw animation (circle fill → checkmark draw → elastic pop)
- [x] `components/TaskCard.tsx` + `CompactTaskCard.tsx` — Card slide-out animation (desktop), progressive swipe feedback (mobile)
- [x] `hooks/useAnimatedList.ts` — FLIP animation hook for row collapse
- [x] `components/TaskList.tsx` — Integrated FLIP hook with `data-task-id` attributes
- [x] `app/globals.css` — Keyframes: `checkmarkDraw`, `circleFill`, `checkboxElasticPop`, `taskSlideOutDesktop`
- [x] Accessibility: `prefers-reduced-motion` disables all animations, `aria-live` announces completions

---

## Phase 4: Empty State Enhancement ✅

- [x] `components/EmptyState.tsx` — Staggered sun ray "dawn" entry animation, rotating completion messages, slow idle ray rotation
- [x] `app/globals.css` — Keyframes: `sunBodyAppear`, `sunRayAppear`, `emptyTextSlideUp`
- [x] Compact variant uses simpler fade-in
- [x] `prefers-reduced-motion` respected

---

## Phase 5: Cleanup and Polish ✅

- [x] Removed `isThreePaneLayout` code
- [x] Removed old `FilterBubble` usage from header
- [x] Keyboard shortcuts: `Cmd+1` / `Cmd+2`
- [x] State isolation: selection cleared when switching modes
- [x] Scan auto-starts when Briefing first accessed

---

## Phase 6: Briefing as First Row + Better Scan Progress ✅

### Part A: Briefing Card Back in Task List

- [x] `components/Navigation.tsx` — `MobileHeader`: Reverted to "Todone" branding. Props simplified (removed `currentView`, `briefingDot`, `counts`). Menu items: Completed/Someday without counts.
- [x] `components/Navigation.tsx` — `DesktopAccountMenu`: Removed `counts` prop.
- [x] `app/page.tsx` — Removed pill toggle, `desktopMode`, `briefingDot`, `counts`. Added `InsightBriefingCard` above `TaskList` (both mobile and desktop, active view only). Extended back button for insights view.
- [x] `components/insight/InsightBriefingCard.tsx` — Label: "Proactive todos" → "Briefing"

### Part B: Better Scan Progress

- [x] `components/insight/InsightView.tsx` — `ScanProgress`: Rotating contextual messages during analyzing (cycles every 2.5s with fade). Time-based asymptotic progress bar (`35 + 25 * (1 - exp(-t/8000))`).
- [x] `components/insight/InsightBriefingCard.tsx` — Rotating messages during analyzing phase.
- [x] `app/api/scan/route.ts` — Kept as `client.messages.create()` (non-streaming). See decision below.

### Part C: Shared Scan State + Timestamp

- [x] `components/insight/InsightBriefingCard.tsx` — Now receives `scan` as a prop (shared from `page.tsx`) instead of calling `useInsightScan()` independently. Card shows real-time progress when user navigates back during a scan.
- [x] `app/page.tsx` — Passes `scan={scan}` to both `InsightBriefingCard` instances (mobile + desktop).
- [x] `hooks/useInsightScan.ts` — Added `completedAt: number | null` to `ExtendedScanState`. Set on SSE `complete` event (`Date.now()`) and from cached scan's `createdAt`.
- [x] `components/insight/InsightView.tsx` — Shows relative timestamp ("5m ago") next to refresh button when scan is complete.

### Key Technical Notes

1. **No LLM streaming** — We tried switching to `client.messages.stream()` with `analysis_progress` SSE events, but reverted. Haiku completes in 2-5s, so intermediate streaming states never render (React batches the setState calls). The rotating messages + time-based progress bar solve the UX problem without streaming complexity.
2. **Shared scan state** — `page.tsx` owns the single `useInsightScan()` call and passes the `scan` object down to both `InsightBriefingCard` and `InsightView`. This ensures the card reflects real-time scan progress when the user navigates back to the task list.
3. **Background completion** — The scan survives navigation because `page.tsx` never unmounts. If the mobile app is backgrounded, the server completes independently and saves to DB; on next open the cached result is returned.
4. **Progress bar is asymptotic** — During analyzing, it creeps from 35% toward ~60% using an exponential decay curve. Never reaches 100% on its own; the completion event replaces the progress UI.

### Testing (Phase 6)
- [ ] **Mobile**: Header shows "Todone" (no toggle). Briefing card is first item in task list.
- [ ] **Mobile**: Tap Briefing card → InsightView with "← Back to tasks". Back returns to task list.
- [ ] **Desktop**: No pill toggle. Briefing card above tasks. Click → InsightView with "← Briefing" back button.
- [ ] **Desktop**: Click insight item → detail in right panel (2-pane max).
- [ ] **Scan progress**: Rotating contextual messages during analyzing ("Reviewing 42 emails...", etc.)
- [ ] **Cmd+1/Cmd+2**: Still work
- [ ] **Menu**: Completed/Someday accessible without counts
- [x] Pre-commit checks pass (lint, typecheck, build)

---

## Files Modified Summary

| File | Phase | Changes |
|---|---|---|
| `lib/types.ts` | 1 | `archived` → `someday` in TaskStatus |
| `hooks/useTasks.ts` | 1 | Rename archive functions/filters to someday |
| `hooks/useAnimatedList.ts` | 3 | New file — FLIP animation hook |
| `app/page.tsx` | 1,2,5,6 | ViewMode, layout, remove pill toggle/3-pane, add briefing card |
| `app/globals.css` | 3,4 | Keyframes for completion + empty state animations |
| `components/Navigation.tsx` | 1,2,6 | Remove BottomNav, MobileHeader branding, menu cleanup |
| `components/TaskCard.tsx` | 1,3 | Someday rename, completion animation, swipe enhancement |
| `components/CompactTaskCard.tsx` | 1,3 | Same renames and animation |
| `components/TaskList.tsx` | 1,3 | Someday rename, FLIP integration |
| `components/ConversationPanel.tsx` | 1 | Archive → Someday in menu |
| `components/EmptyState.tsx` | 1,4 | Someday state, dawn animation, message rotation |
| `components/ui/CircularCheckbox.tsx` | 3 | SVG checkmark with stroke-draw animation |
| `supabase/migrations/012_rename_archived_to_someday.sql` | 1 | DB enum migration |
| `components/insight/InsightBriefingCard.tsx` | 6 | Label → "Briefing", rotating analyzing messages, shared scan prop |
| `components/insight/InsightView.tsx` | 6 | ScanProgress rotating messages, time-based progress bar, last scan timestamp |
| `hooks/useInsightScan.ts` | 6 | Added `completedAt` to state |

## Architecture Notes

### Key invariants
- Tasks with `source: 'insight'` are hidden from `activeTasks` (filtered in `useTasks.ts`)
- Agent runs in background regardless of view (`AgentContext` is global)
- `insightActionTaskMapRef` maps insight action IDs → task IDs
- `autoStartAgentTaskId` triggers agent start for insight tasks
- All task mutations: `useTasks` hook → Supabase API → localStorage cache

### No new dependencies
All animations use CSS keyframes and a small FLIP utility. No `framer-motion` or animation libraries.
