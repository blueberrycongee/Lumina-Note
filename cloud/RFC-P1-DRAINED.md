# RFC: Lumina-Note cloud integration — P1 drained, next milestone?

**Status:** drafting · 2026-04-28
**Owner:** Lead
**Author:** loop agent (one 8-hour session, 12 iterations)

P1 backlog (`cloud/TASKS.md`) is now `[x]` or `[BLOCKED]` for every item. This RFC summarises what shipped, what's blocked, and what should land next so a P2 milestone can be picked.

---

## 1. Shipped (9 PRs, all open against `main`)

Stack order for review/merge:

| PR | Task | One line | Stack base |
|---|---|---|---|
| #217 | C1 | Scaffold `src/services/luminaCloud/` (types + stubs + barrel) | `main` |
| #218 | C2 | Ed25519 `verifyLicense` + JCS canonical-json + 24 tests | #217 |
| #220 | C4 | `useLicenseStore` (zustand), 9 tests cover the four status transitions | #218 |
| #221 | C5 | Typed HTTP client + `LuminaCloudError`, 21 tests, no new runtime deps (manual fetch mock) | #217 |
| #222 | C6 | Revocation cache with in-memory default (disk persistence pending C3), 7 tests | #221 |
| #223 | C7 | Lumina Cloud provider definition + visibility helper + dynamic model fetch, 8 tests | #221 |
| #224 | C8 | `LicenseSettings` panel (Tailwind, standalone, no `AISettingsModal` dep), 7 tests | #220 |
| #225 | C9 | `CloudUsagePanel` with 60s polling + stale-cache-on-error, 7 tests | #221 (+merge of C4) |
| #227 | C12 | End-to-end test (license → setLicense → visible → mock chat → usage delta), 3 tests | #225 (+merge of C7) |

**Test totals:** 86 unit/integration tests, all passing.
**New deps:** `@noble/ed25519@^3.1.0`, `@noble/hashes@^2.2.0`. The latter is required to wire the synchronous SHA-512 slot v3 leaves empty — necessary to keep `verifyLicense` sync as `CONTRACT.md` §1.3 specifies.

### Recommended merge order

`main` → #217 → #218 → #220 → #221 → #222 → #223 → #224 → #225 → #227.

The two merge commits in the C9 and C12 stacks (bringing C4/C7 into the C5-rooted line) become no-ops once the upstream PRs land.

### Surfaces touched

Strictly within PRD §3:

- New: `src/services/luminaCloud/{client,types,verify,store,revocations,canonical-json,PUBLIC_KEY,index}.ts` + tests.
- New: `src/services/llm/providers/luminaCloud.ts` + test.
- New: `src/components/settings/LicenseSettings.tsx` + test.
- New: `src/components/settings/CloudUsagePanel.tsx` + test.
- New: `src/stores/useLicenseStore.ts` + test.
- New: `src/__tests__/luminaCloud.e2e.test.ts`.
- Mod: `package.json`, `package-lock.json` (deps).
- Mod: `cloud/TASKS.md` (task tracker).

`src/components/ai/AISettingsModal.tsx` was **not touched** — C11 reserved it.

---

## 2. Blocked (3 PRs + 1 pre-block)

All three blocks are spec-vs-PRD-§3 tensions, not implementation difficulty. Each is gated on a one-liner from Lead.

| PR | Task | The ask |
|---|---|---|
| #219 | C3 — License storage in OS keychain | The IPC dispatcher in `electron/main/ipc.ts` needs **3 additive lines** (import + factory + dispatch branch) to register a new handler set. C3's spec caps existing-file edits at "a single named import". Approve 3 additive lines, or specify alternate wiring. |
| #226 | C10 — Account tab mount | The settings nav lives in `src/components/layout/SettingsModal.tsx` — outside PRD §3's allow-list. Wiring is small (~8 lines + a locale string). Approve the edit, specify another mount point, or widen §3. |
| #228 | C13 — README mention | `README.en.md` and `README.zh-CN.md` are outside §3's allow-list. PRD §3's stated reason is "blast radius" (code-internal), but the literal rule applies. Approve docs as exempt, or pick a different mention surface. |

**C11 — `AISettingsModal.tsx`** is pre-blocked in `cloud/TASKS.md` on the user's WIP edit lock. No PR opened. When that WIP is committed/stashed, C11's "add Lumina Cloud row to provider list" can ship in <10 additive lines using `LUMINA_CLOUD_PROVIDER` + `isLuminaCloudVisible` from #223.

### Pattern worth Lead's attention

All three blocks above are the same shape: the task description tells the loop agent to edit a file, but PRD §3's allow-list doesn't include that file. PRD §3 wins by the rule "If your code disagrees with it, your code is wrong, not the contract." A single Lead read of §3's intent (does it cover docs? settings nav? IPC dispatcher additions?) would unblock all three at once.

---

## 3. Follow-ups (carry-overs that aren't blocked)

- **Real public key.** `src/services/luminaCloud/PUBLIC_KEY.ts` ships an obviously-fake all-zero placeholder. Lead replaces it from the lumina-cloud T3 keypair generation output. The fixture-key pattern in C2 means tests don't depend on this.
- **Disk persistence for license + revocations.** C6 ships an in-memory default that de-dupes within a session but doesn't survive restart. Drop-in replacement once C3 unblocks (the `RevocationStorage` interface is exported for exactly this).
- **C7 model display label.** The provider renders model `id` as both the catalog id and the human label (e.g. `lumina:claude-opus-4-7`). If Lead wants "Claude Opus 4.7" instead, CONTRACT.md §2.3 needs a `display_name` field.
- **License invalidation reason.** Local `verifyLicense` returns `null` without distinguishing signature-bad vs malformed vs expired. CONTRACT.md §2.1's `verifyLicenseOnline` returns a `reason`. Worth wiring §2.1 into the failure path of `LicenseSettings` for richer feedback — small follow-up, not on critical path.

---

## 4. Proposed P2 picks

A non-binding sketch for what to do next, ordered by likely value:

1. **Sync (S1 in CONTRACT.md §3 — `lumina-sync-monthly`).** Already pre-blocked in `TASKS.md`. Schema and feature flag are reserved; needs a backend story.
2. **Account portal (login from app, password reset, manage SKUs).** The license-as-bearer model means today the Lumina-Note app has no concept of an "account" beyond the license string. A web portal at `app.lumina-note.com` would close the loop.
3. **Refund / revocation UX.** When a license is revoked the client just hides cloud features. A status copy explaining *why* would reduce support noise. Cheap follow-up to C13's marketing copy push.
4. **Quota soft-limits + warnings.** `CloudUsagePanel` shows raw numbers; warning at 80%/95%/100% would reduce surprise. Frontend-only.
5. **Anthropic-side model auth caching.** Today every chat turn makes a fresh Bearer-auth call. Server-side license-verification cache (1-min TTL) would reduce per-request latency. Server-side change, not client.

These are sketch only — Lead picks the actual P2 backlog.

---

## 5. Loop session metrics

- 12 iterations, ~96 minutes of an 8-hour budget.
- 9 ship PRs + 3 block PRs + this RFC.
- 86 tests across 12 files, all passing.
- 0 secrets committed. 0 edits to PRD.md / CONTRACT.md / `AISettingsModal.tsx`.
- 0 forced-pushes, 0 amends, 0 main pushes.
