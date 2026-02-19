# Session 2-19: Durable Insight Prep Persistence + UI Polish

## Bugs Addressed & Fixed

### Bug 1: Briefing "Start scan" flash on mobile [DONE]
When navigating to the Briefing view on mobile, users briefly saw the IdleState ("Start scan" button) before the auto-start useEffect kicked in — because the mobile `InsightView` wasn't receiving the shared `scan` prop.

**Fix**: `app/page.tsx` (~line 583): Pass `scan={scan}` to mobile `InsightView`, matching desktop.

### Bug 2: Meeting preps / email drafts lost on rescan [DONE]
Results lived in tasks but on rescan, the scan route queried fragile `insight_actions` (cascade-delete with scans). Frontend's `insightActionTaskMapRef` was also lost on page reload.

**Fix**: Added `source_ref` column to `tasks` table. On rescan, query `tasks WHERE source='insight' AND source_ref IS NOT NULL` instead.

### Bug 3: Action state stuck on "Preparing..." [DONE]
`scan.actionStates[actionId].taskId` stored a server-generated UUID from the execute API, but the agent ran on a different task ID created by `addTask()`. The watcher effect couldn't find the agent.

**Fix**: `app/page.tsx` action state watcher now checks `insightActionTaskMapRef.current.get(actionId)` first to find the actual task ID.

### Bug 4: InsightItem click target issues [DONE]
Dismiss button had `opacity-0` but was still clickable, eating clicks via `stopPropagation`. Required 3 clicks to open an item.

**Fix**: Added `pointer-events-none group-hover:pointer-events-auto` to dismiss button. Changed outer element from `<div>` to `<button>` for reliable click/tap handling.

### Bug 5: Already-prepped meetings re-triggering prep [DONE]
After page reload with cached scan: (1) empty ref map, (2) wrong taskId in actionStates, (3) cached scan path didn't annotate actions with `preppedTaskId`.

**Fix**: Three-layer fix:
- Frontend: Added sourceRef-based lookup (`tasks.find(t => t.sourceRef === eventId)`) as definitive fallback
- Same for emails with `threadId`
- Backend: Cached scan path now queries durable tasks and annotates quickWin/bundles with `preppedTaskId`

### Bug 6: ConversationPanel Pin/Someday for insight tasks [DONE]
Pin and Someday buttons don't make sense for meeting preps and email drafts.

**Fix**: Wrapped Pin/Someday buttons in `{task.source !== 'insight' && (...)}` guard.

## UI Polish Completed

### Briefing List Redesign [DONE]
- Removed large colored avatar circles, replaced with smaller 32px avatars with soft bg colors
- Changed `<div>` to `<button type="button">` for reliable click handling
- Simplified layout: sender · subject on one truncated line, suggestion as lighter second line
- Status indicators: smaller circles with soft backgrounds (bg-blue-50, bg-green-50)
- Dismiss button: absolute positioned, pointer-events-none until hover
- Removed "Proactive todos" header with sparkle icon
- Greeting collapsed to single truncated line (13px, tertiary color)
- Gray section bars replaced with lightweight inline `SectionLabel` component (uppercase, small, with icon)

### Warmth & Color Pass [DONE]
- **Pin icons**: Changed from blue (`text-inbox-accent`) to warm amber (`text-amber-500`) across CompactTaskCard, TaskCard, ConversationPanel
- **Pin hover actions**: `hover:text-amber-500 hover:bg-amber-500/10`
- **Agent "Working..." indicator**: Added soft blue pill background (`bg-inbox-accent-light/60 rounded-full px-2.5 py-1`)
- **CircularCheckbox hover**: Changed from blue to green preview (`hover:border-inbox-success/40 hover:bg-inbox-success/5`)
- **InsightBriefingCard sparkle**: Idle icon changed to warm gold (`text-amber-400`)

## Database Changes

### Migration 013: `source_ref` column [APPLIED]
- `ALTER TABLE tasks ADD COLUMN source_ref TEXT`
- Partial index: `CREATE INDEX idx_tasks_source_ref ON tasks(user_id, source, source_ref) WHERE source_ref IS NOT NULL`
- Applied via SQL Editor (not `supabase db push` due to pg_cron issues with migrations 010-012)

## Files Modified (16 files)

| File | Change |
|------|--------|
| `supabase/migrations/013_task_source_ref.sql` | New: add source_ref column + index |
| `lib/types.ts` | Added sourceRef to Task, toSupabaseTask, fromSupabaseTask |
| `lib/supabase/types.ts` | Added source_ref to Row/Insert/Update |
| `lib/tasks.ts` | createTask accepts sourceRef |
| `hooks/useTasks.ts` | addTask passes sourceRef |
| `app/api/tasks/route.ts` | Include sourceRef in POST |
| `app/api/scan/route.ts` | Query tasks for preppedMap; cached scan annotation |
| `lib/scan/types.ts` | Added preppedTaskId to MeetingPrepContext + EventNeedsPrep |
| `lib/scan/metadata.ts` | findEventsNeedingPrep uses preppedRefMap + preppedTaskId |
| `app/page.tsx` | Pass scan to mobile; sourceRef to addTask; preppedTaskId click; action state watcher fix; sourceRef fallback lookups |
| `components/insight/InsightView.tsx` | Redesigned sections, compact greeting, preppedTaskId handling |
| `components/insight/InsightItem.tsx` | Full rewrite: smaller avatars, button element, cleaner layout |
| `components/insight/InsightBriefingCard.tsx` | Warm gold sparkle icon |
| `components/ConversationPanel.tsx` | Hide Pin/Someday for insight tasks, amber pin |
| `components/CompactTaskCard.tsx` | Amber pin icon |
| `components/TaskCard.tsx` | Amber pin, blue pill working indicator |
| `components/ui/CircularCheckbox.tsx` | Green hover preview |

## Still TODO (for next session)

### Testing (manual verification)
- [ ] Briefing flash: Navigate to Briefing on mobile → no "Start scan" flash
- [ ] Meeting prep persistence: Prep → rescan → "View prep" → click → opens ConversationPanel
- [ ] Email draft persistence: Draft → rescan → completed state → click → opens with draft
- [ ] Fresh scan: New items show as actionable (not falsely marked as prepped)
- [ ] Page reload after prep → rescan → preps found via source_ref

### Remaining polish items
- [ ] Mobile briefing list touch targets and scroll behavior
- [ ] InsightItem animation on dismiss (currently instant removal)
- [ ] Briefing card animation when scan completes (items appearing)
- [ ] Empty state when all briefing items are dismissed
- [ ] Dark mode pass for all new amber/green/gold colors

### Infrastructure
- [ ] Unpushed migrations 010-012 (pg_cron dependency) — may need to enable pg_cron in Supabase Dashboard or make migration 010 optional

## Decisions Made

1. **`source_ref` on tasks table** — simplest path since tasks are already durable
2. **Partial index** `WHERE source_ref IS NOT NULL` — most tasks won't have source_ref
3. **Legacy fallback** — kept `preppedActionId` path for old preps; new preps use `preppedTaskId`
4. **Both meetings and emails** get source_ref and alreadyPrepped handling
5. **Migration via SQL Editor** — `supabase db push` blocked by older unpushed migrations
6. **Warm amber for pins** — matches Inbox-by-Gmail warmth; green for completion preview
7. **Lightweight section labels** — uppercase text with icon instead of heavy gray bars
