# Todone - Claude Code Synopsis

## What You're Building

Todone is an AI planner that helps users find and execute tasks. It should look and feel like a native Google Workspace app (think Google Tasks, but smarter).

You have two reference documents:
1. **Todone_Product_Brief_v5.md** — Full product spec, features, and phasing
2. **todone-design-guidelines.md** — Material Design 3 / Google Workspace design system

---

## Key Changes in v5.0

### 1. Gmail & Calendar Integration (Read-Only)

**What it does:**
- Connects to user's Gmail and Calendar with read-only OAuth
- Scans for action items (requests, deadlines, meeting prep needs)
- Surfaces suggested tasks in an "Inbox" zone for user to triage

**UX Flow:**
```
User opens Todone
    ↓
"Suggested Tasks" section shows:
  - "Reply to landlord about lease" (from Gmail)
  - "Prep for 1:1 with Sarah" (from Calendar)
    ↓
User taps [Add to List], [Dismiss], or [Already Done]
    ↓
Only confirmed tasks get researched
```

**Implementation Notes:**
- Use Google OAuth with minimal read-only scopes
- Never store full email content—only extracted task signals
- User controls: sensitivity settings, exclude senders/calendars
- Inbox zone is separate from the main task list

---

### 2. Todone-Managed Drive Folder

**What it does:**
- Todone owns a Google Workspace account
- Creates a folder per user in Todone's Drive
- Shares that folder with the user
- Saves outputs (research docs, comparisons, drafts) to this folder

**Why this approach:**
- User never gives Todone access to their Drive
- Todone shares its own folder with them
- Folder appears in user's "Shared with me"
- Feels native, low permission friction

**Folder Structure:**
```
Todone Outputs/
├── Research/
│   └── Car Insurance Comparison.gsheet
├── Drafts/
│   └── Email to Landlord.gdoc
└── Reports/
    └── Weekly Summary.gdoc
```

**Implementation Notes:**
- Phase 2: "Save to Drive" button (on-demand)
- Phase 3+: Auto-save for substantial outputs
- Use Google Drive API with service account credentials

---

### 3. Design System: Google Workspace Native

**The goal:** Todone should feel like it was built by Google. Users familiar with Gmail, Drive, or Google Tasks should feel at home.

**Key design tokens:**
- Primary blue: `#1A73E8` (Google blue)
- Surface: `#FFFFFF` / `#F8F9FA` for containers
- Text: `#202124` primary, `#5F6368` secondary
- Font: Google Sans for headings, Roboto for body
- Border radius: 12px for cards, 20px (pill) for buttons
- Icons: Material Symbols (outlined, weight 400)

**Component patterns:**
- Checkboxes: Circular (Google Tasks style), not square
- Cards: Outlined or elevated, 12px radius
- Buttons: Pill-shaped filled buttons for primary actions
- Lists: 56px height single-line, 72px two-line
- Navigation: Bottom nav on mobile, rail on tablet, drawer on desktop

**Generative UI:**
- Plan cards expand to show AI-generated steps
- Progressive disclosure: collapsed → expanded → detailed
- Skeleton loading while AI researches
- AI suggestions have left border accent + sparkle icon

See `todone-design-guidelines.md` for full specs including colors, typography, spacing, and platform-specific guidance.

---

## Implementation Priority

### Phase 1 (Build Now)
1. Core task input + list UI
2. Instant research with Gemini (8-second reveal)
3. CEO-briefing cards with generated actions
4. Material Design 3 styling per design guidelines
5. localStorage persistence

### Phase 2 (Next)
1. User accounts (Clerk)
2. Per-task chat
3. Personal memory/context
4. Supabase migration

### Phase 3 (After Validation)
1. Gmail read-only integration
2. Calendar read-only integration
3. Inbox zone for suggested tasks
4. "Save to Drive" button
5. Todone-managed Drive folder setup

---

## Quick Reference

**Colors:**
```css
--primary: #1A73E8;
--primary-container: #D2E3FC;
--surface: #FFFFFF;
--surface-container: #F8F9FA;
--on-surface: #202124;
--on-surface-variant: #5F6368;
--outline: #DADCE0;
```

**Typography:**
- Headings: Google Sans, 500 weight
- Body: Roboto, 400 weight
- Labels: Roboto, 500 weight, 14px

**Spacing:**
- Base unit: 4px
- Standard padding: 16px
- Section spacing: 24px

**Key UI Patterns:**
- Task item: Circular checkbox + title + subtitle (AI summary)
- Plan card: Expandable with numbered steps
- Suggested task: Card with source badge + quick actions
- Loading: Skeleton shimmer, not spinner

---

## Don't Forget

1. **Speed matters**: Research must complete in <8 seconds or users bounce
2. **Skip research for personal tasks**: "Call mom" doesn't need AI—show 💭 icon
3. **Progressive disclosure**: Don't overwhelm with info—expand on demand
4. **Read-only trust**: Emphasize we read Gmail/Calendar but never write
5. **Native feel**: Should feel like Google built it, not a third-party app

---

*Start with Phase 1. Nail the magic moment. Everything else follows.*
