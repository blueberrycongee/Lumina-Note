# Sidebar Visual Declutter Design

## Problem

Left sidebar has too many visual dividers (border-b between sections, OpenClaw's full rounded rectangle border, button borders), creating a fragmented appearance that increases cognitive load.

## Design Principles

- **Gestalt proximity**: items close together are perceived as grouped — no explicit borders needed
- **Pluggable modules**: OpenClaw may be removed in the future; design must work seamlessly with or without it
- **Two-zone layout**: toolbar zone (quick actions, team, plugins, favorites) separated from content zone (file tree) by minimal dividers

## Changes

### Remove
- OpenClaw outer border (`border border-border rounded-lg`) — make it visually equal to other toolbar modules
- `border-b` dividers between toolbar modules (quick actions, team, OpenClaw, favorites)
- Quick action button borders — use hover background instead

### Keep
- One horizontal divider: Header → toolbar zone
- One horizontal divider: toolbar zone → file tree
- Status bar `border-t` (separate concern, bottom of sidebar)
- OpenClaw internal structure (unchanged, will be relocated later)
- All color, radius, and animation variables

### Add
- Unified flex-col + gap container wrapping all toolbar modules
- Consistent group spacing (~12px gap between module groups)
- Tight spacing within groups (~2px between sibling items)

## Layout

```
Header buttons
────────────────── (divider)
Quick actions (today note, voice note)
                   (gap)
Team/org section
                   (gap)
OpenClaw content   ← pluggable, removal leaves no visual hole
                   (gap)
Favorites
────────────────── (divider)
File tree
Status bar
```

## Files to modify

| File | Change |
|------|--------|
| `src/components/layout/Sidebar.tsx` | Wrap toolbar modules in flex-col + gap container; remove inter-module border-b |
| `src/components/layout/SidebarQuickActions.tsx` | Remove button borders, keep hover bg |
| `src/components/layout/OpenClawSection.tsx` | Remove outer `border border-border rounded-lg` only |
