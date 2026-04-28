# Lumina Note · Cloud Integration — PRD

**Status:** Draft v0.1 · 2026-04-28
**Owner:** blueberrycongee
**Sibling repo:** [`blueberrycongee/lumina-cloud`](https://github.com/blueberrycongee/lumina-cloud) (private, closed-source)
**Scope of this doc:** the work that must happen **inside the open-source `Lumina-Note` repo** to enable commercialization via `lumina-cloud`. The commercial backend itself is specified in the sibling repo.

> This document is **separate from `PRODUCT.md`**. `PRODUCT.md` is the brand / product positioning of the app overall. This file is the **commercialization initiative spec**: what this repo needs to ship in order for paying customers to exist.

---

## 1. Purpose

Make the open-source Lumina Note client capable of:

1. Accepting a **license** (typed in by the user, stored in OS keychain).
2. Verifying the license **offline** using a bundled public key.
3. Exposing **"Lumina Cloud"** as a 12th LLM provider that uses the user's license to access the AI gateway in `lumina-cloud`.
4. Showing **usage / quota** in the AI settings, so users feel in control.
5. (P2) Toggling **"Sync to Lumina"** as an alternative to WebDAV / self-host relay.

All without breaking the existing self-host, BYO-API-key, or fully-offline experience.

---

## 2. Constraints

- **License remains permissive.** Repo stays Apache 2.0. Nothing in this initiative may close source any existing file.
- **No secrets in the repo.** Only the **public key** is hardcoded. Private signing key lives in `lumina-cloud` only.
- **No vendor lock-in.** The user can always choose another provider or self-host. Cloud is one option among many, not a requirement.
- **No telemetry.** Usage counters only flow when the user is actively using `Lumina Cloud`; nothing is reported when the user is on local providers or offline.
- **No regression in the offline path.** Removing the license / disabling cloud must leave the app fully functional.
- **Existing `server/` directory is untouched.** That's the self-host relay and stays open. Hosted sync (P2) is a separate codebase in `lumina-cloud`.

---

## 3. Surfaces affected

```
src/
├── services/
│   ├── luminaCloud/         ← NEW. All cloud-related client code lives here.
│   │   ├── client.ts        HTTP client to api.lumina-note.com
│   │   ├── PUBLIC_KEY.ts    Hardcoded Ed25519 public key
│   │   ├── verify.ts        Offline license verification
│   │   ├── store.ts         License storage in OS keychain (electron safeStorage)
│   │   ├── revocations.ts   Daily-refreshed revocation list cache
│   │   └── types.ts         Mirrors CONTRACT.md license payload + responses
│   └── llm/
│       └── providers/
│           └── luminaCloud.ts ← NEW. Registers "Lumina Cloud" as a provider that delegates to luminaCloud/client.
├── components/
│   ├── settings/
│   │   ├── LicenseSettings.tsx       ← NEW. Enter / view / remove license.
│   │   └── CloudUsagePanel.tsx       ← NEW. Shows tokens used / quota.
│   └── ai/
│       └── AISettingsModal.tsx       ← MINIMAL EDIT. Add Lumina Cloud row to provider list.
└── stores/
    └── useLicenseStore.ts   ← NEW. Zustand store for license state.
```

**Outside `cloud/`, `src/services/luminaCloud/`, `src/services/llm/providers/luminaCloud.ts`, `src/components/settings/LicenseSettings.tsx`, `src/components/settings/CloudUsagePanel.tsx`, `src/stores/useLicenseStore.ts`, and minimal additive edits to `src/components/ai/AISettingsModal.tsx`, no other file may be modified by the loop agent for this initiative.** This guardrail keeps blast radius small.

---

## 4. Non-goals (P1)

- **No license generation logic** in this repo. That's `lumina-cloud` only.
- **No payment UI / Creem flow** in the desktop app. Users buy on the website; license arrives by email.
- **No multi-account / team support.** One license per install in P1.
- **No cloud sync UI changes.** That's P2.
- **No mobile-app changes.** Desktop only in P1.

---

## 5. UX summary

1. User buys on the marketing website (Creem checkout).
2. They get an email with a license string.
3. They open the desktop app → Settings → Account → "Enter license".
4. They paste the license. The app verifies it offline, stores it in OS keychain.
5. AI Settings now shows a new provider row: **"Lumina Cloud"** with a "Default" label.
6. The user can pick a model from the curated Lumina Cloud list and start chatting / agenting.
7. AI Settings shows: **"You've used 123,456 / 5,000,000 tokens this month."**
8. To stop: remove license → cloud row disappears → app is back to BYOK / offline.

---

## 6. Source of truth & change discipline

- **This PRD** — what to build in this repo. Lead-only edits.
- **`CONTRACT.md`** — wire-level API. **Must stay byte-identical to `lumina-cloud/CONTRACT.md`.** Lead-only edits.
- **`TASKS.md`** — execution backlog. Loop agent updates progress; Lead defines what gets added.

---

## 7. Risks & open questions

- **Where does the license entry UI live?** Most natural: under existing AI Settings modal as a new section, or as a new top-level "Account" tab. Defaulting to a new "Account" tab to avoid bloating AI Settings; revisit if users miss it.
- **OS keychain availability.** Electron `safeStorage` is available on macOS & Windows, soft-fallback on Linux to a file with restrictive perms (clearly documented).
- **Network failures.** All cloud requests must degrade gracefully — local providers must remain usable when `api.lumina-note.com` is unreachable.
- **Mobile companion apps** under `mobile/` will eventually need their own license flow. **Out of P1 scope** but the contract here is designed so it ports cleanly.

---

## 8. Done = ?

P1 is done when:

- A user can paste a license, see it verified, and successfully run an AI chat against `Lumina Cloud` at `https://api.lumina-note.com`.
- Removing the license fully reverses the integration with no leaked state.
- All new code is covered by unit tests (≥ 80% line coverage in `src/services/luminaCloud/`).
- E2E test exists that exercises license entry → cloud chat → usage display.
- `README.md` has a short "Lumina Cloud (paid)" section explaining the option exists, with a link to the marketing site, **without making the open-source path feel second-class**.
