// Sidebar surface uses the same `bg-background` as the canvas (chat /
// editor) and the right panel, with a 1px inset right hairline as the
// only separator. Earlier this surface used `bg-muted` (one elevation
// tier above canvas), which read as "a darker panel hard-glued to the
// content" — especially noticeable in dark mode where the 5L delta
// between muted and bg lands above the just-noticeable difference for
// grays, but doesn't quite read as deliberate "lifted panel" without
// real vibrancy/translucency (which Electron can't supply). Going flat
// matches the modern Linear / Notion pattern and removes the visual
// split between left and the rest of the app.
export const SIDEBAR_SURFACE_CLASSNAME = [
  'ui-compact-row relative overflow-hidden w-full h-full flex flex-col',
  'shadow-[inset_-1px_0_0_hsl(var(--border)/0.7)] bg-background',
].join(' ');
