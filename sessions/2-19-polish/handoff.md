# Session 2-19: Polish Handoff

## Branch
`feature/ia-makeover` — continue on this branch

## What Was Done (Session 2-18)

The IA makeover restructured Todone's navigation and added polish animations. See `sessions/2-18-IA-makeover/plan.md` for full details. Summary:

1. **Renamed "Archived" to "Someday"** — across types, hooks, components, DB migration
2. **Removed bottom nav and pill toggles** — replaced with simple "Todone" header + overflow menu
3. **Briefing as first row in task list** — `InsightBriefingCard` renders above `TaskList` when viewing active tasks. Click navigates to `InsightView` with back arrow.
4. **Completion animation** — SVG checkmark draw, card slide-out, FLIP row collapse
5. **Empty state "dawn" animation** — staggered sun rays, rotating messages
6. **Scan progress UX** — rotating contextual messages during analyzing phase, time-based progress bar
7. **Shared scan state** — `page.tsx` owns single `useInsightScan()` and passes `scan` prop to both `InsightBriefingCard` and `InsightView`
8. **Last scan timestamp** — relative time ("5m ago") shown next to refresh button in InsightView
9. **Keyboard shortcuts** — `Cmd+1` Tasks, `Cmd+2` Briefing

## What Needs Polish

### Must Test (not yet manually verified)
- [ ] **Mobile**: Header shows "Todone" (no toggle). Briefing card is first item in task list.
- [ ] **Mobile**: Tap Briefing card → InsightView with "← Back to tasks". Back returns to task list with scan progress reflected in the card.
- [ ] **Desktop**: No pill toggle. Briefing card above tasks. Click → InsightView with "← Briefing" back button.
- [ ] **Desktop**: Click insight item → detail in right panel (2-pane max).
- [ ] **Scan progress**: Rotating contextual messages during analyzing ("Reviewing 42 emails...", etc.)
- [ ] **Scan timestamp**: Shows "just now" / "5m ago" etc. next to refresh button after scan completes
- [ ] **Navigate away during scan**: Hit back while scan is in progress → briefing card shows spinner + rotating messages → eventually shows completion with count badge
- [ ] **Cmd+1/Cmd+2**: Still work
- [ ] **Menu**: Completed/Someday accessible without counts
- [ ] **Completion animation**: Check → slide out → rows collapse smoothly (both mobile swipe and desktop click)
- [ ] **Empty state**: Sun ray animation plays when all tasks completed
- [ ] **Someday**: Swipe left → amber "Someday" action. Someday view accessible from menu.

### Known Polish Areas
- **InsightBriefingCard visual design** — currently plain. May want a subtle background, border, or icon treatment to differentiate from regular tasks
- **Scan progress bar** — the asymptotic curve means the bar never reaches the end during analyzing. Consider a completion animation when scan finishes (bar fills to 100% then transitions to results)
- **Transition animations** — navigating between task list and InsightView is instant (no transition). Consider a subtle slide or fade
- **Timestamp update** — `formatRelativeTime` in InsightView only renders once; the "5m ago" text doesn't live-update (would need a timer to re-render periodically)
- **Mobile safe areas** — verify nothing is cut off on notched iPhones (especially the briefing card at top and quick capture bar at bottom)
- **Dark mode** — all new components use inbox-* tokens but should be verified in dark mode if it exists
- **Accessibility** — completion animation respects `prefers-reduced-motion`, but verify screen reader announcements for scan progress, briefing card state changes
- **Error recovery** — if scan fails and user hits back, card shows "Scan failed". Need to verify tapping the card retries

## Key Files to Know

| File | Role |
|------|------|
| `app/page.tsx` | Main layout — owns scan state, renders mobile/desktop, routes between views |
| `components/insight/InsightBriefingCard.tsx` | Card in task list — receives `scan` prop, shows progress/results |
| `components/insight/InsightView.tsx` | Full briefing view — grouped meetings/emails, refresh button + timestamp |
| `components/insight/InsightItem.tsx` | Individual action row in InsightView |
| `components/insight/InsightDetailPanel.tsx` | Right panel for selected insight action (desktop) |
| `hooks/useInsightScan.ts` | Scan lifecycle — SSE streaming, cached results, action states, `completedAt` |
| `components/Navigation.tsx` | Header (mobile + desktop) and overflow menu |
| `components/ui/CircularCheckbox.tsx` | SVG checkmark animation |
| `hooks/useAnimatedList.ts` | FLIP animation for row collapse after completion |
| `components/EmptyState.tsx` | Dawn animation when task list is empty |

## Architecture Reminders

- `useInsightScan()` uses `useState` — each call is independent state. That's why `page.tsx` calls it once and passes `scan` as a prop. Do NOT add `useInsightScan()` calls in child components.
- Scan survives view navigation because `page.tsx` never unmounts. If mobile app is backgrounded, server completes independently and caches result in DB.
- `InsightView` accepts an optional `scan` prop (`externalScan`). If not provided it creates its own — but in practice `page.tsx` always provides it.
- The `ScanObject` type in `InsightView.tsx` is the canonical interface for the scan prop. Both `InsightView` and `InsightBriefingCard` import from there.
