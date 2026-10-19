---
version: alpha
name: Neki Admin
description: Neki 운영 업무를 빠르게 조회하고 처리하는 관리자 인터페이스
colors:
  primary: "#f55243"
  primary-soft: "#fff4f2"
  canvas: "#f7f8f8"
  surface: "#ffffff"
  text: "#202227"
  text-muted: "#6f7382"
  border: "#e3e4e8"
  success: "#237a4b"
  info: "#1768b6"
typography:
  sans:
    fontFamily: '"Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
rounded:
  sm: "8px"
  md: "10px"
  lg: "16px"
  full: "999px"
spacing:
  page-inline: "36px"
  section-gap: "16px"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.section-gap}"
  control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "40px"
  accent:
    backgroundColor: "{colors.primary}"
  selected-surface:
    backgroundColor: "{colors.primary-soft}"
  app-canvas:
    backgroundColor: "{colors.canvas}"
  secondary-copy:
    textColor: "{colors.text-muted}"
  divider:
    backgroundColor: "{colors.border}"
  positive-state:
    textColor: "{colors.success}"
  focus-state:
    backgroundColor: "{colors.info}"
---

# Product character

Neki Admin is a compact operational workspace. It should feel calm, precise, and immediately scannable rather than promotional. The persistent sidebar establishes place; page headings, restrained cards, and dense tables establish hierarchy.

# Canonical implementation

`app/globals.css` owns CSS variables, responsive layout, data-density rules, and native scrollbar styling. `app/admin/AdminApp.tsx` owns Ant Design theme tokens and application-shell composition. Feature UI belongs under `app/admin/features/<feature>/ui/` and consumes these shared decisions without redefining a competing theme.

# Layout

- Desktop uses a fixed 248px sidebar and a content canvas capped at 1380px.
- Content sections use 16px vertical gaps. A page heading precedes controls, summary cards, charts, and tables.
- At 1040px and below the sidebar becomes a horizontal navigation rail.
- At 680px and below toolbars stack to one column and wide data tables remain horizontally scrollable.

# Typography

- Pretendard is the primary family; platform sans-serif fonts are fallbacks.
- Page titles are 28px/38px and use strong negative tracking.
- Section titles are 17–20px. Labels and supporting metadata are 10–13px.
- Numeric metrics use tabular numerals and strong weight for rapid comparison.

# Color and surface

- Coral is reserved for selection, priority series, and primary action emphasis.
- White cards sit on the neutral canvas with a quiet border and restrained shadow.
- Green communicates positive movement; coral-red communicates negative movement.
- Do not introduce product-specific gradients or decorative colors for individual feature pages.

# Components

- Use Ant Design controls, cards, dates, tables, empty states, tooltips, and statistics.
- Controls use the shared radius and 40px target height unless density requires the documented small size.
- Data tables keep labels short, align numeric columns right, and preserve horizontal access on narrow screens.
- Charts provide text labels, keyboard focus, and tooltips; color is never the only accessible description.

# Content

Use only labels, values, actions, and state messages needed to perform the task. Product rationale, mock/API implementation details, and conversation context belong in documentation, never in the interface.
