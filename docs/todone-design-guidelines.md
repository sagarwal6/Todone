# Todone Design Guidelines

A comprehensive design system for building Todone with native Google Workspace aesthetics using Material Design 3 (M3) principles.

---

## Core Design Philosophy

Todone should feel like it was built by Google as a natural extension of Google Workspace. Users familiar with Gmail, Google Drive, Google Tasks, Google Keep, or Google Calendar should feel immediately at home. The interface should be clean, functional, and quietly intelligent—never flashy or attention-seeking.

### Guiding Principles

1. **Clarity over cleverness** — Every element serves a purpose. No decorative flourishes.
2. **Content-first** — The user's tasks and plans are the hero, not the UI.
3. **Progressive disclosure** — Show only what's needed. Reveal complexity on demand.
4. **Quiet intelligence** — AI assistance should feel seamless, not performative.
5. **Cross-platform consistency** — Web, iOS, and Android should feel unified while respecting platform conventions.

---

## Color System

### Primary Palette (Google Blue)

Use Google's signature blue as the primary action color. This creates immediate familiarity with Workspace products.

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#1A73E8` | Primary buttons, active states, links, FAB |
| `primary-hover` | `#1557B0` | Hover state for primary elements |
| `primary-container` | `#D2E3FC` | Selected/active backgrounds, chips |
| `on-primary` | `#FFFFFF` | Text/icons on primary color |
| `on-primary-container` | `#041E49` | Text on primary container |

### Neutral Palette

Google Workspace uses a warm gray palette that feels approachable rather than cold.

| Token | Hex | Usage |
|-------|-----|-------|
| `surface` | `#FFFFFF` | Main background, cards |
| `surface-dim` | `#F1F3F4` | Secondary backgrounds, dividers |
| `surface-container` | `#F8F9FA` | Elevated surfaces, sidebars |
| `surface-container-high` | `#E8EAED` | Higher elevation, hover states |
| `on-surface` | `#202124` | Primary text |
| `on-surface-variant` | `#5F6368` | Secondary text, icons |
| `outline` | `#DADCE0` | Borders, dividers |
| `outline-variant` | `#E8EAED` | Subtle dividers |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `error` | `#D93025` | Errors, destructive actions |
| `error-container` | `#FCE8E6` | Error backgrounds |
| `success` | `#1E8E3E` | Success states, completion |
| `success-container` | `#E6F4EA` | Success backgrounds |
| `warning` | `#F9AB00` | Warnings, attention needed |
| `warning-container` | `#FEF7E0` | Warning backgrounds |

### Dark Mode

Follow M3 dark theme specifications. Surface colors invert while maintaining the same semantic relationships.

| Token | Hex (Dark) |
|-------|------------|
| `surface` | `#202124` |
| `surface-dim` | `#171717` |
| `surface-container` | `#292A2D` |
| `surface-container-high` | `#35363A` |
| `on-surface` | `#E8EAED` |
| `on-surface-variant` | `#9AA0A6` |
| `outline` | `#5F6368` |
| `primary` | `#8AB4F8` |
| `primary-container` | `#004A77` |

---

## Typography

### Font Stack

```css
/* Primary font - Google Sans for headings and emphasis */
font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;

/* Body font - Roboto for body text and UI */
font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;

/* Monospace - for any code or technical content */
font-family: 'Roboto Mono', 'SF Mono', monospace;
```

### Type Scale

Use M3 type scale with Google Sans for display/headline and Roboto for body.

| Style | Font | Weight | Size | Line Height | Letter Spacing | Usage |
|-------|------|--------|------|-------------|----------------|-------|
| `display-large` | Google Sans | 400 | 57px | 64px | -0.25px | Hero moments (rare) |
| `display-medium` | Google Sans | 400 | 45px | 52px | 0 | Large headers |
| `display-small` | Google Sans | 400 | 36px | 44px | 0 | Section headers |
| `headline-large` | Google Sans | 400 | 32px | 40px | 0 | Page titles |
| `headline-medium` | Google Sans | 500 | 28px | 36px | 0 | Card titles |
| `headline-small` | Google Sans | 500 | 24px | 32px | 0 | Subsection titles |
| `title-large` | Google Sans | 500 | 22px | 28px | 0 | Dialog titles |
| `title-medium` | Roboto | 500 | 16px | 24px | 0.15px | List item titles |
| `title-small` | Roboto | 500 | 14px | 20px | 0.1px | Smaller titles |
| `body-large` | Roboto | 400 | 16px | 24px | 0.5px | Primary body text |
| `body-medium` | Roboto | 400 | 14px | 20px | 0.25px | Secondary body text |
| `body-small` | Roboto | 400 | 12px | 16px | 0.4px | Captions, hints |
| `label-large` | Roboto | 500 | 14px | 20px | 0.1px | Buttons, tabs |
| `label-medium` | Roboto | 500 | 12px | 16px | 0.5px | Chips, small buttons |
| `label-small` | Roboto | 500 | 11px | 16px | 0.5px | Timestamps, metadata |

### iOS Adjustments

On iOS, fall back to SF Pro when Google Sans is unavailable. Maintain the same size/weight relationships.

```css
/* iOS fallback */
font-family: 'Google Sans', -apple-system, 'SF Pro Display', 'SF Pro Text', sans-serif;
```

---

## Spacing & Layout

### Spacing Scale (4px base unit)

All spacing should be multiples of 4px to maintain visual rhythm.

| Token | Value | Usage |
|-------|-------|-------|
| `spacing-xs` | 4px | Tight spacing, icon gaps |
| `spacing-sm` | 8px | Related element spacing |
| `spacing-md` | 12px | Component internal padding |
| `spacing-lg` | 16px | Standard padding, margins |
| `spacing-xl` | 24px | Section spacing |
| `spacing-2xl` | 32px | Large section breaks |
| `spacing-3xl` | 48px | Major layout divisions |

### Layout Grid

**Web (Desktop)**
- Max content width: 1200px (centered)
- Sidebar width: 256px (collapsible)
- Main content area: Fluid with 24px horizontal padding
- 12-column grid for complex layouts

**Web (Tablet)**
- Sidebar collapses to icons (72px) or fully hidden
- 8-column grid
- 16px horizontal padding

**Mobile (iOS/Android)**
- Full-width content
- 16px horizontal padding
- Bottom navigation for primary actions
- 4-column grid

### Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| `compact` | < 600px | Single column, bottom nav, full-width cards |
| `medium` | 600-904px | Collapsible sidebar, 2-column possible |
| `expanded` | 905-1239px | Persistent sidebar, multi-column |
| `large` | 1240-1439px | Full sidebar, centered content |
| `extra-large` | ≥ 1440px | Maximum content width enforced |

---

## Components

### Buttons

**Filled Button (Primary Actions)**
- Background: `primary` (#1A73E8)
- Text: `on-primary` (#FFFFFF)
- Border radius: 20px (pill shape)
- Height: 36px (touch target: 48px)
- Padding: 0 24px
- Font: `label-large`
- Hover: `primary-hover` background
- States: Include ripple effect on tap/click

**Tonal Button (Secondary Actions)**
- Background: `primary-container` (#D2E3FC)
- Text: `on-primary-container` (#041E49)
- Same dimensions as filled

**Outlined Button (Tertiary Actions)**
- Background: transparent
- Border: 1px solid `outline` (#DADCE0)
- Text: `primary` (#1A73E8)
- Hover: `surface-container` background

**Text Button (Low Emphasis)**
- Background: transparent
- Text: `primary` (#1A73E8)
- Padding: 0 12px
- Hover: `primary-container` background at 8% opacity

**Icon Button**
- Size: 40px × 40px (touch target: 48px)
- Icon size: 24px
- Border radius: 20px (circle)
- Background: transparent
- Hover: `surface-container-high`

**FAB (Floating Action Button)**
- Size: 56px × 56px
- Border radius: 16px
- Background: `primary-container`
- Icon: `on-primary-container`
- Elevation: Level 3 (6dp shadow)
- Position: Bottom-right, 16px from edges

### Cards

**Elevated Card**
- Background: `surface`
- Border radius: 12px
- Elevation: Level 1 (1dp shadow)
- Padding: 16px
- Hover: Level 2 elevation

**Filled Card**
- Background: `surface-container`
- Border radius: 12px
- No elevation
- Padding: 16px

**Outlined Card**
- Background: `surface`
- Border: 1px solid `outline`
- Border radius: 12px
- No elevation
- Padding: 16px

### List Items

**Standard List Item**
- Height: 56px (single line) / 72px (two line) / 88px (three line)
- Padding: 16px horizontal
- Leading icon/avatar: 40px, with 16px end margin
- Trailing icon/action: 24px
- Divider: `outline-variant`, inset to text

**Task List Item (Todone-specific)**
- Checkbox: 18px, circular, `outline` border
- Checked state: `primary` fill with white checkmark
- Title: `title-medium`, `on-surface`
- Subtitle (AI-generated step): `body-medium`, `on-surface-variant`
- Swipe actions: Complete (green), Reschedule (blue), Delete (red)

### Checkboxes

Follow Google Tasks checkbox style:
- Size: 18px
- Unchecked: Circular outline, 2px border, `on-surface-variant`
- Checked: `primary` fill, white checkmark icon
- Hover: Subtle `primary-container` glow
- Animation: Smooth fill with checkmark drawing animation (200ms)

### Text Fields

**Outlined Text Field (Default)**
- Height: 56px
- Border: 1px solid `outline`
- Border radius: 4px
- Focused border: 2px solid `primary`
- Label: Floating, `body-small` when focused
- Padding: 16px horizontal
- Background: transparent

**Filled Text Field**
- Background: `surface-container`
- Border: none, with 1px bottom border `outline`
- Border radius: 4px 4px 0 0
- Focused: 2px bottom border `primary`

### Chips

**Assist Chip (AI suggestions)**
- Height: 32px
- Border radius: 8px
- Border: 1px solid `outline`
- Background: transparent
- Icon (left): 18px
- Label: `label-large`
- Tap: `primary-container` background

**Filter Chip**
- Same as assist, but with checkmark when selected
- Selected: `primary-container` background, no border

**Input Chip**
- Same dimensions
- With trailing X for removal
- Used for tags, categories

### Navigation

**Top App Bar**
- Height: 64px
- Background: `surface`
- Elevation: 0 (scroll: Level 2)
- Leading: Navigation icon (hamburger or back) 48px
- Title: `title-large`, centered or start-aligned
- Trailing: Action icons (search, more)

**Navigation Rail (Tablet)**
- Width: 72px
- Icons: 24px with label below
- Selected: `primary-container` pill behind icon
- Background: `surface-container`

**Bottom Navigation (Mobile)**
- Height: 80px (with labels) / 64px (icons only)
- 3-5 destinations max
- Selected: `primary` icon, `primary-container` pill
- Labels: `label-medium`

**Navigation Drawer**
- Width: 256px
- Background: `surface-container`
- Section headers: `title-small`, `on-surface-variant`
- Items: 56px height, `body-large`
- Selected: `primary-container` background, `primary` text
- Hover: `surface-container-high`

### Dialogs

**Basic Dialog**
- Width: 280px min, 560px max
- Border radius: 28px
- Background: `surface-container-high`
- Padding: 24px
- Title: `headline-small`
- Content: `body-medium`
- Actions: Right-aligned text buttons, 8px gap

**Full-screen Dialog (Mobile)**
- Slide up animation
- Top bar with close (X) and action
- Used for multi-step flows

### Bottom Sheets

**Standard Bottom Sheet**
- Border radius: 28px 28px 0 0
- Background: `surface-container-low`
- Drag handle: 32px × 4px, centered, `outline`
- Max height: 90% of screen

**Modal Bottom Sheet**
- Same styling
- Scrim: `#000000` at 32% opacity
- Dismiss: Tap scrim or swipe down

---

## Generative UI Patterns

These patterns define how AI-generated content should appear in Todone.

### Plan Cards

When Todone generates a plan from a task, display it as an expandable card:

```
┌─────────────────────────────────────┐
│ ○ Plan vacation to Japan            │  ← Main task (checkbox + title)
│   ├─ 4 steps • ~2 hours total       │  ← Summary meta
│   ▼                                 │  ← Expand/collapse
├─────────────────────────────────────┤
│ ① Research destinations      15 min │  ← Step with estimate
│   Tokyo, Kyoto, Osaka...            │  ← AI context (muted)
│                                     │
│ ② Book flights              30 min │
│   Compare ANA, JAL...               │
│                                     │
│ ③ Reserve accommodations    45 min │
│ ④ Plan daily itinerary      30 min │
└─────────────────────────────────────┘
```

**Styling:**
- Main card: Outlined card style
- Steps: Numbered circles (Google Tasks style)
- Time estimates: `label-small`, `on-surface-variant`, right-aligned
- AI context: `body-small`, `on-surface-variant`, italicized, truncated to 1 line
- Expand animation: Smooth height transition (250ms ease-out)

### Progressive Disclosure

Never show all information at once. Use these density levels:

**Collapsed (Default)**
- Task title + checkbox
- Step count badge (e.g., "4 steps")
- Next action preview (1 line)

**Expanded**
- All steps visible
- Time estimates
- Brief AI context per step

**Detailed (On tap)**
- Full AI explanation
- Related resources/links
- Edit/customize options

### Skeleton Loading

While AI generates plans, show:
- Checkbox + task title (immediate)
- Pulsing skeleton lines (2-3) for steps
- Subtle shimmer animation
- "Planning..." label in `on-surface-variant`

```css
/* Skeleton animation */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, 
    var(--surface-container) 25%, 
    var(--surface-container-high) 50%, 
    var(--surface-container) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### Inline AI Suggestions

When AI suggests next steps or edits:

- Appear below current content with subtle slide-in (200ms)
- Background: `primary-container` at 40% opacity
- Left border: 3px solid `primary`
- Icon: Sparkle/magic wand (✨) in `primary`
- Dismiss: X button or swipe

### Status Indicators

**In Progress**
- Circular progress indicator (indeterminate)
- `primary` color, 24px
- Label: "Working on it..." in `body-small`

**Completed**
- Checkmark animation (draws in)
- `success` color
- Brief celebration (optional): Subtle confetti or pulse

**Blocked/Waiting**
- Pause icon
- `warning` color
- Context: "Waiting for: [dependency]"

---

## Iconography

### Icon Style

Use Material Symbols (outlined variant, weight 400) for consistency with Google Workspace.

```html
<!-- Google Fonts link -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" rel="stylesheet">
```

### Standard Sizes

| Context | Size | Optical Size |
|---------|------|--------------|
| Navigation | 24px | 24 |
| List leading | 24px | 24 |
| Button icon | 18px | 20 |
| Inline text | 18px | 20 |
| FAB | 24px | 24 |
| Header action | 24px | 24 |

### Key Icons for Todone

| Action | Icon Name |
|--------|-----------|
| Add task | `add` |
| Complete | `check_circle` |
| Delete | `delete` |
| Edit | `edit` |
| Schedule | `schedule` |
| AI/Magic | `auto_awesome` |
| Expand | `expand_more` |
| Collapse | `expand_less` |
| Menu | `menu` |
| Back | `arrow_back` |
| Close | `close` |
| More options | `more_vert` |
| Search | `search` |
| Settings | `settings` |
| Folder/Project | `folder` |
| Filter | `filter_list` |
| Sort | `sort` |
| Refresh | `refresh` |
| Share | `share` |
| Star/Priority | `star` |
| Flag | `flag` |
| Calendar | `calendar_today` |
| Clock/Time | `schedule` |
| Person | `person` |
| Team | `group` |

---

## Motion & Animation

### Timing

Follow M3 motion principles with Google's refined curves.

| Type | Duration | Easing |
|------|----------|--------|
| Small (icons, checkboxes) | 100-150ms | ease-out |
| Medium (cards, dialogs) | 200-250ms | ease-in-out |
| Large (page transitions) | 300-350ms | ease-in-out |
| Enter | 250ms | decelerate (0, 0, 0.2, 1) |
| Exit | 200ms | accelerate (0.4, 0, 1, 1) |

### Standard Animations

**Checkbox completion**
```css
/* Circle fills, then checkmark draws */
.checkbox-complete {
  animation: fill 150ms ease-out, check 100ms ease-out 100ms;
}
```

**Card expand/collapse**
```css
.card-expand {
  transition: height 250ms cubic-bezier(0, 0, 0.2, 1);
}
```

**FAB press**
```css
.fab:active {
  transform: scale(0.95);
  transition: transform 100ms ease-out;
}
```

**List item swipe**
- Swipe reveals action (complete/delete)
- Background color fades in
- Icon scales up
- Snap threshold: 30% of width
- Release animation: 200ms spring

**Page transitions (Mobile)**
- Forward: Slide left, 300ms
- Back: Slide right, 250ms
- Modal: Slide up, 300ms

### Ripple Effect

Use Material ripple on all tappable elements:
- Origin: Touch point
- Color: `on-surface` at 12% opacity
- Duration: 400ms
- Spread: Circular, covers element

---

## Elevation & Shadows

Follow M3 elevation system (tonal elevation preferred over shadows).

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | None | Flat surfaces |
| 1 | `0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)` | Cards, list items |
| 2 | `0 2px 4px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.08)` | Raised cards on hover |
| 3 | `0 4px 8px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.08)` | FAB, floating elements |
| 4 | `0 8px 16px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.08)` | Dialogs |
| 5 | `0 12px 24px rgba(0,0,0,0.1), 0 12px 32px rgba(0,0,0,0.08)` | Modals, popovers |

### Tonal Elevation (Preferred for M3)

Instead of shadows, use surface tint overlays for elevation:

```css
/* Surface at elevation 1 */
.surface-1 {
  background: color-mix(in srgb, var(--primary) 5%, var(--surface));
}

/* Surface at elevation 2 */
.surface-2 {
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}
```

---

## Platform-Specific Guidelines

### iOS

**Navigation**
- Use iOS-standard back gesture (swipe from left edge)
- Bottom tab bar for primary nav (max 5 items)
- Large titles in navigation bar when appropriate
- Safe area insets for notch/home indicator

**Typography**
- Fall back to SF Pro when Google Sans unavailable
- Dynamic Type support for accessibility
- Same visual hierarchy, adjusted for SF metrics

**Components**
- Use iOS-style switches (not Android toggles)
- Date/time pickers: iOS native wheel style
- Haptic feedback on completions and actions
- Pull-to-refresh with standard iOS spinner

**Gestures**
- Swipe to delete/complete (iOS standard)
- Long press for context menu
- Pinch to collapse/expand sections

### Android

**Navigation**
- Material 3 navigation patterns
- Predictive back gesture support
- Navigation drawer or rail based on screen size

**Components**
- Material 3 components throughout
- Native date/time pickers
- Material You dynamic color support (optional)

**System Integration**
- Support Android widgets
- App shortcuts (long-press app icon)
- Notification channels

### Web

**Navigation**
- Keyboard shortcuts (Cmd/Ctrl + N for new task, etc.)
- Browser back/forward integration
- URL-based routing for deep links

**Components**
- Hover states on all interactive elements
- Focus indicators for accessibility
- Right-click context menus

**Responsiveness**
- Fluid layouts between breakpoints
- Sidebar behavior adapts to width
- Touch support for hybrid devices

---

## Accessibility

### Color Contrast

All text must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- Interactive elements: 3:1 minimum

### Touch Targets

- Minimum touch target: 48px × 48px
- Spacing between targets: 8px minimum
- Visual element can be smaller if touch area is adequate

### Screen Readers

- All images have alt text
- Icons have aria-labels
- Dynamic content announces updates
- Logical heading hierarchy
- Focus management in modals/sheets

### Motion

- Respect `prefers-reduced-motion`
- Provide static alternatives for animations
- No auto-playing animations over 5 seconds

### Keyboard Navigation

- All actions reachable via keyboard
- Visible focus indicators
- Logical tab order
- Escape closes modals/sheets

---

## Implementation Notes

### CSS Custom Properties

```css
:root {
  /* Colors */
  --md-sys-color-primary: #1A73E8;
  --md-sys-color-on-primary: #FFFFFF;
  --md-sys-color-primary-container: #D2E3FC;
  --md-sys-color-on-primary-container: #041E49;
  --md-sys-color-surface: #FFFFFF;
  --md-sys-color-surface-dim: #F1F3F4;
  --md-sys-color-surface-container: #F8F9FA;
  --md-sys-color-surface-container-high: #E8EAED;
  --md-sys-color-on-surface: #202124;
  --md-sys-color-on-surface-variant: #5F6368;
  --md-sys-color-outline: #DADCE0;
  --md-sys-color-outline-variant: #E8EAED;
  --md-sys-color-error: #D93025;
  --md-sys-color-success: #1E8E3E;
  --md-sys-color-warning: #F9AB00;
  
  /* Typography */
  --md-sys-typescale-body-large-font: 'Roboto', sans-serif;
  --md-sys-typescale-body-large-size: 16px;
  --md-sys-typescale-body-large-weight: 400;
  --md-sys-typescale-body-large-line-height: 24px;
  
  /* Spacing */
  --md-sys-spacing-sm: 8px;
  --md-sys-spacing-md: 12px;
  --md-sys-spacing-lg: 16px;
  --md-sys-spacing-xl: 24px;
  
  /* Shape */
  --md-sys-shape-corner-small: 4px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-full: 9999px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --md-sys-color-primary: #8AB4F8;
    --md-sys-color-surface: #202124;
    --md-sys-color-on-surface: #E8EAED;
    /* ... etc */
  }
}
```

### SwiftUI (iOS)

```swift
// Define as extension on Color
extension Color {
    static let mdPrimary = Color(hex: "1A73E8")
    static let mdOnPrimary = Color.white
    static let mdPrimaryContainer = Color(hex: "D2E3FC")
    static let mdSurface = Color.white
    static let mdOnSurface = Color(hex: "202124")
    static let mdOnSurfaceVariant = Color(hex: "5F6368")
    static let mdOutline = Color(hex: "DADCE0")
}

// Typography
extension Font {
    static let mdHeadlineSmall = Font.custom("GoogleSans-Medium", size: 24)
    static let mdTitleMedium = Font.system(size: 16, weight: .medium)
    static let mdBodyLarge = Font.system(size: 16, weight: .regular)
    static let mdBodyMedium = Font.system(size: 14, weight: .regular)
    static let mdLabelLarge = Font.system(size: 14, weight: .medium)
}
```

### Jetpack Compose (Android)

```kotlin
// Use Material 3 theme with custom colors
private val LightColors = lightColorScheme(
    primary = Color(0xFF1A73E8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD2E3FC),
    surface = Color.White,
    onSurface = Color(0xFF202124),
    onSurfaceVariant = Color(0xFF5F6368),
    outline = Color(0xFFDADCE0)
)

@Composable
fun TodoneTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = TodoneTypography,
        content = content
    )
}
```

---

## File & Folder Structure

Recommended component organization:

```
/design-system
  /tokens
    colors.css
    typography.css
    spacing.css
    elevation.css
  /components
    /buttons
    /cards
    /lists
    /inputs
    /navigation
    /dialogs
    /sheets
  /patterns
    /plan-card
    /task-item
    /ai-suggestion
    /loading-states
  /icons
    (Material Symbols subset)
```

---

## Resources

- [Material Design 3](https://m3.material.io/)
- [Material Symbols](https://fonts.google.com/icons)
- [Google Fonts (Google Sans, Roboto)](https://fonts.google.com/)
- [Material Theme Builder](https://m3.material.io/theme-builder)
- [Google Workspace Design](https://workspace.google.com/) (for reference)

---

*Last updated: January 2026*
*Version: 1.0*
