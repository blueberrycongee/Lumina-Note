# Token Secure Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move auth token from localStorage to OS Keychain, and stop exposing token in plaintext in the QR pairing UI.

**Architecture:** Add a `secure_store` Rust module using the `keyring` crate to store/retrieve/delete secrets via OS-level credential storage (macOS Keychain, Windows Credential Manager, Linux Secret Service). Frontend store splits session persistence: non-sensitive metadata stays in localStorage, token goes through Tauri commands to keychain. QR pairing payload text display is removed.

**Tech Stack:** Rust `keyring` crate, Tauri commands, Zustand persist middleware, `@tauri-apps/api/core` invoke

---

### Task 1: Add `keyring` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml:15-56`

**Step 1: Add keyring to dependencies**

In `[dependencies]` section, add after the `serde_json` line:

```toml
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore: add keyring crate for OS-level secret storage"
```

---

### Task 2: Create `secure_store` Rust module

**Files:**
- Create: `src-tauri/src/secure_store.rs`
- Modify: `src-tauri/src/main.rs` (add mod + register commands + manage state)
- Modify: `src-tauri/src/lib.rs` (add mod + re-exports)

**Step 1: Create `src-tauri/src/secure_store.rs`**

```rust
use tauri::command;

const SERVICE_NAME: &str = "lumina-note";

#[command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read from keyring: {}", e)),
    }
}

#[command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Failed to write to keyring: {}", e))
}

#[command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone, that's fine
        Err(e) => Err(format!("Failed to delete from keyring: {}", e)),
    }
}
```

**Step 2: Register module in `main.rs`**

Add `mod secure_store;` with the other mod declarations (after `mod proxy;`).

In `generate_handler![]`, add after the proxy commands block:

```rust
// Secure store commands
secure_store::secure_store_get,
secure_store::secure_store_set,
secure_store::secure_store_delete,
```

**Step 3: Register module in `lib.rs`**

Add `pub mod secure_store;` with the other mod declarations.

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

**Step 5: Commit**

```bash
git add src-tauri/src/secure_store.rs src-tauri/src/main.rs src-tauri/src/lib.rs
git commit -m "feat: add secure_store module for OS keychain access"
```

---

### Task 3: Add frontend helper for secure store commands

**Files:**
- Create: `src/lib/secureStore.ts`

**Step 1: Create the helper**

```typescript
import { invoke } from '@tauri-apps/api/core';

const CLOUD_TOKEN_KEY = 'cloud-auth-token';

export async function getSecureToken(): Promise<string | null> {
  return invoke<string | null>('secure_store_get', { key: CLOUD_TOKEN_KEY });
}

export async function setSecureToken(token: string): Promise<void> {
  await invoke('secure_store_set', { key: CLOUD_TOKEN_KEY, value: token });
}

export async function deleteSecureToken(): Promise<void> {
  await invoke('secure_store_delete', { key: CLOUD_TOKEN_KEY });
}
```

**Step 2: Commit**

```bash
git add src/lib/secureStore.ts
git commit -m "feat: add secureStore frontend helper for keychain token"
```

---

### Task 4: Modify `useCloudSyncStore` — remove token from localStorage, save/load via keychain

**Files:**
- Modify: `src/stores/useCloudSyncStore.ts`

This is the core change. Three modifications:

**Step 1: Add imports and new action to interface**

At top of file, add import:

```typescript
import { getSecureToken, setSecureToken, deleteSecureToken } from '@/lib/secureStore';
```

Add to `CloudSyncState` interface:

```typescript
rehydrateToken: () => Promise<void>;
```

**Step 2: Modify `authenticate()` — save token to keychain after login/register**

After `const session = deriveNextSession(response);` on line 85, add:

```typescript
await setSecureToken(session.token);
```

**Step 3: Modify `refreshSession()` — update keychain when token refreshes**

After `const nextSession = { ...session, token: response.token };` on line 128, add:

```typescript
await setSecureToken(response.token);
```

In the catch block (line 132-134), after setting state, add:

```typescript
deleteSecureToken().catch(() => {});
```

**Step 4: Modify `logout()` — delete token from keychain**

Change logout from:

```typescript
logout: () => {
  set({ session: null, authStatus: 'anonymous', password: '', error: null });
  useWebDAVStore.getState().resetConfig();
},
```

To:

```typescript
logout: () => {
  set({ session: null, authStatus: 'anonymous', password: '', error: null });
  useWebDAVStore.getState().resetConfig();
  deleteSecureToken().catch(() => {});
},
```

**Step 5: Add `rehydrateToken` action**

Add inside the store creator, after `logout`:

```typescript
rehydrateToken: async () => {
  const session = get().session;
  if (!session) return;
  // Session metadata was restored from localStorage but token was stripped.
  // Fetch the real token from the OS keychain.
  try {
    const token = await getSecureToken();
    if (token) {
      set({ session: { ...session, token }, authStatus: 'authenticated' });
    } else {
      // Token gone from keychain — force re-login
      set({ session: null, authStatus: 'anonymous' });
    }
  } catch {
    set({ session: null, authStatus: 'anonymous' });
  }
},
```

**Step 6: Modify `partialize` — strip token from persisted session**

Change the partialize function from:

```typescript
partialize: (state) => ({
  serverBaseUrl: state.serverBaseUrl,
  email: state.email,
  password: '',
  autoSync: state.autoSync,
  syncIntervalSecs: state.syncIntervalSecs,
  session: state.session,
  authStatus: state.session ? 'authenticated' : 'anonymous',
  isLoading: false,
  error: null,
}),
```

To:

```typescript
partialize: (state) => ({
  serverBaseUrl: state.serverBaseUrl,
  email: state.email,
  password: '',
  autoSync: state.autoSync,
  syncIntervalSecs: state.syncIntervalSecs,
  session: state.session
    ? { ...state.session, token: '' }
    : null,
  authStatus: state.session ? 'authenticated' : 'anonymous',
  isLoading: false,
  error: null,
}),
```

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

**Step 8: Commit**

```bash
git add src/stores/useCloudSyncStore.ts
git commit -m "feat: store auth token in OS keychain instead of localStorage"
```

---

### Task 5: Call `rehydrateToken` on app startup

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add rehydration effect**

After the existing `useEffect` that bridges CloudSync to OrgStore (around line 94-98), add:

```typescript
const rehydrateToken = useCloudSyncStore((s) => s.rehydrateToken);

useEffect(() => {
  rehydrateToken();
}, [rehydrateToken]);
```

This runs once on mount. If the session was restored from localStorage with an empty token, it fetches the real token from keychain.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: rehydrate auth token from keychain on app startup"
```

---

### Task 6: Remove plaintext token display from QR pairing UI

**Files:**
- Modify: `src/components/settings/CloudRelaySection.tsx`

**Step 1: Remove the raw payload text display**

Delete lines 215-217 (the div that shows `status.pairing_payload` as plaintext):

```tsx
{/* DELETE THIS BLOCK */}
<div className="text-[10px] text-foreground/70 break-all">
  {status.pairing_payload}
</div>
```

The QR code SVG stays — users scan it to pair. But the raw JSON string (which contains the token) is no longer visible as text.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/settings/CloudRelaySection.tsx
git commit -m "fix: remove plaintext token display from QR pairing UI"
```

---

### Task 7: Update existing tests

**Files:**
- Modify: `src/stores/useCloudSyncStore.test.ts`

**Step 1: Mock the secure store module**

Add at the top of the test file, before any imports or after the vi.mock calls:

```typescript
vi.mock('@/lib/secureStore', () => ({
  getSecureToken: vi.fn().mockResolvedValue('mock-token'),
  setSecureToken: vi.fn().mockResolvedValue(undefined),
  deleteSecureToken: vi.fn().mockResolvedValue(undefined),
}));
```

**Step 2: Run existing tests**

Run: `npx vitest run src/stores/useCloudSyncStore.test.ts`
Expected: all existing tests pass

**Step 3: Add test for rehydrateToken**

```typescript
it('rehydrateToken restores token from keychain', async () => {
  const { getSecureToken } = await import('@/lib/secureStore');
  vi.mocked(getSecureToken).mockResolvedValue('keychain-token');

  // Simulate a session restored from localStorage with empty token
  useCloudSyncStore.setState({
    session: {
      token: '',
      user: { id: 'u1', email: 'test@example.com' },
      workspaces: [],
      currentWorkspaceId: null,
    },
    authStatus: 'authenticated',
  });

  await useCloudSyncStore.getState().rehydrateToken();

  const state = useCloudSyncStore.getState();
  expect(state.session?.token).toBe('keychain-token');
  expect(state.authStatus).toBe('authenticated');
});

it('rehydrateToken forces re-login when keychain has no token', async () => {
  const { getSecureToken } = await import('@/lib/secureStore');
  vi.mocked(getSecureToken).mockResolvedValue(null);

  useCloudSyncStore.setState({
    session: {
      token: '',
      user: { id: 'u1', email: 'test@example.com' },
      workspaces: [],
      currentWorkspaceId: null,
    },
    authStatus: 'authenticated',
  });

  await useCloudSyncStore.getState().rehydrateToken();

  const state = useCloudSyncStore.getState();
  expect(state.session).toBeNull();
  expect(state.authStatus).toBe('anonymous');
});
```

**Step 4: Verify test for logout calls deleteSecureToken**

Add or update:

```typescript
it('logout deletes token from keychain', () => {
  const { deleteSecureToken } = require('@/lib/secureStore');
  useCloudSyncStore.setState({
    session: {
      token: 'some-token',
      user: { id: 'u1', email: 'test@example.com' },
      workspaces: [],
      currentWorkspaceId: null,
    },
    authStatus: 'authenticated',
  });

  useCloudSyncStore.getState().logout();

  expect(deleteSecureToken).toHaveBeenCalled();
  expect(useCloudSyncStore.getState().session).toBeNull();
});
```

**Step 5: Run all tests**

Run: `npx vitest run src/stores/useCloudSyncStore.test.ts`
Expected: all tests pass

**Step 6: Commit**

```bash
git add src/stores/useCloudSyncStore.test.ts
git commit -m "test: add tests for keychain token storage and rehydration"
```

---

### Task 8: Final verification

**Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all 1042+ tests pass

**Step 3: Verify localStorage no longer contains token**

Manual check: after building and running the app, open DevTools → Application → Local Storage → `lumina-cloud-sync`. The `session.token` field should be `""` (empty string), not an actual token value.

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: token secure storage cleanup"
```
