# Database Frontend Rules Index

This index is the baseline for all database UI changes. Apply these rules before adding new database features.

## 1) Visual baseline
- Match note workspace shell style (`bg-background/55`, subtle border, moderate blur).
- Use database tokens and primitives (`db-*` classes, `src/components/database/primitives.tsx`) instead of hardcoded colors/radius/shadows.
- Avoid local style systems that conflict with existing `ui-*` and `db-*` tokens.

## 2) Motion baseline
- Feedback motion: 120ms.
- Panel motion: 180ms.
- Layout motion: 220ms.
- Allowed animated properties: `transform`, `opacity`, and necessary color/border/shadow transitions for affordance.
- Never use `transition: all` for database interactions.
- Respect `prefers-reduced-motion`.

## 3) Interaction baseline
- Every key action must expose hover, active, focus-visible, loading, empty, and error states.
- Icon-only buttons must include `aria-label`.
- Inputs and form controls require visible labels or `aria-label`.
- Error copy must be actionable.

## 4) Data compatibility baseline
- Keep compatibility with existing frontmatter and `Databases/*.db.json`.
- No destructive migration in UI milestones.
- URL should reflect major view state when applicable (view/filter/pagination).

## 5) Engineering baseline
- Incremental change only, no rewrite.
- One milestone = one conventional commit.
- Run minimal required verification (`build`/`test`/`type`) before commit.
