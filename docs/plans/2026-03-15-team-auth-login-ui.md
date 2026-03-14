# Team Auth Login UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone login/register UI flow for team collaboration features, seamlessly integrated into the existing Lumina-Note design language.

**Architecture:** When a user clicks the team section in Sidebar without being authenticated, a full-screen auth modal (TeamAuthModal) appears over the current workspace. It reuses `useCloudSyncStore` for all auth logic (register/login/logout/refresh) and passes the session token to `useOrgStore`. No new backend work is needed — the server already has complete auth endpoints (POST /auth/register, /auth/login, /auth/refresh).

**Tech Stack:** React 18 + Zustand + Tailwind CSS + Framer Motion + Lucide Icons + Vitest (jsdom)

**Commit Strategy:** All commits are atomic — each commit is a single, self-contained unit of work (one component, one test file, one integration point). Every commit compiles and does not break existing functionality.

**Final Step:** Push directly to `origin/main` after all tasks are complete and verified.

---

## Task 1: Add i18n translation keys for auth UI

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/zh-TW.ts`
- Modify: `src/i18n/locales/ja.ts`

**Step 1: Add `auth` namespace to all 4 locale files**

In `en.ts`, add inside the root object (after the `team` namespace):

```typescript
auth: {
  signIn: 'Sign In',
  signUp: 'Sign Up',
  logout: 'Log Out',
  email: 'Email',
  emailPlaceholder: 'you@example.com',
  password: 'Password',
  passwordPlaceholder: 'At least 6 characters',
  serverUrl: 'Server URL',
  serverUrlPlaceholder: 'https://sync.example.com',
  welcomeTitle: 'Team Collaboration',
  welcomeSubtitle: 'Sign in to access shared workspaces, real-time collaboration, and team projects.',
  noAccount: "Don't have an account?",
  hasAccount: 'Already have an account?',
  switchToSignUp: 'Create one',
  switchToSignIn: 'Sign in',
  signingIn: 'Signing in...',
  signingUp: 'Creating account...',
  authError: 'Authentication failed. Please check your credentials.',
  serverError: 'Cannot connect to server. Please check the URL.',
  passwordTooShort: 'Password must be at least 6 characters.',
  emailRequired: 'Email is required.',
  serverUrlRequired: 'Server URL is required.',
  signInToAccess: 'Sign in to access team features',
},
```

In `zh-CN.ts`:

```typescript
auth: {
  signIn: '登录',
  signUp: '注册',
  logout: '退出登录',
  email: '邮箱',
  emailPlaceholder: 'you@example.com',
  password: '密码',
  passwordPlaceholder: '至少 6 个字符',
  serverUrl: '服务器地址',
  serverUrlPlaceholder: 'https://sync.example.com',
  welcomeTitle: '团队协作',
  welcomeSubtitle: '登录以访问共享工作区、实时协作和团队项目。',
  noAccount: '还没有账号？',
  hasAccount: '已有账号？',
  switchToSignUp: '立即注册',
  switchToSignIn: '去登录',
  signingIn: '正在登录...',
  signingUp: '正在创建账号...',
  authError: '认证失败，请检查您的凭据。',
  serverError: '无法连接服务器，请检查地址。',
  passwordTooShort: '密码至少需要 6 个字符。',
  emailRequired: '请输入邮箱。',
  serverUrlRequired: '请输入服务器地址。',
  signInToAccess: '请登录以使用团队功能',
},
```

In `zh-TW.ts`:

```typescript
auth: {
  signIn: '登入',
  signUp: '註冊',
  logout: '登出',
  email: '電子郵件',
  emailPlaceholder: 'you@example.com',
  password: '密碼',
  passwordPlaceholder: '至少 6 個字元',
  serverUrl: '伺服器位址',
  serverUrlPlaceholder: 'https://sync.example.com',
  welcomeTitle: '團隊協作',
  welcomeSubtitle: '登入以存取共享工作區、即時協作和團隊專案。',
  noAccount: '還沒有帳號？',
  hasAccount: '已有帳號？',
  switchToSignUp: '立即註冊',
  switchToSignIn: '去登入',
  signingIn: '正在登入...',
  signingUp: '正在建立帳號...',
  authError: '驗證失敗，請檢查您的憑據。',
  serverError: '無法連線伺服器，請檢查位址。',
  passwordTooShort: '密碼至少需要 6 個字元。',
  emailRequired: '請輸入電子郵件。',
  serverUrlRequired: '請輸入伺服器位址。',
  signInToAccess: '請登入以使用團隊功能',
},
```

In `ja.ts`:

```typescript
auth: {
  signIn: 'ログイン',
  signUp: '新規登録',
  logout: 'ログアウト',
  email: 'メールアドレス',
  emailPlaceholder: 'you@example.com',
  password: 'パスワード',
  passwordPlaceholder: '6文字以上',
  serverUrl: 'サーバーURL',
  serverUrlPlaceholder: 'https://sync.example.com',
  welcomeTitle: 'チームコラボレーション',
  welcomeSubtitle: '共有ワークスペース、リアルタイムコラボレーション、チームプロジェクトにアクセスするにはログインしてください。',
  noAccount: 'アカウントをお持ちでない方',
  hasAccount: 'アカウントをお持ちの方',
  switchToSignUp: '新規登録',
  switchToSignIn: 'ログイン',
  signingIn: 'ログイン中...',
  signingUp: 'アカウント作成中...',
  authError: '認証に失敗しました。資格情報を確認してください。',
  serverError: 'サーバーに接続できません。URLを確認してください。',
  passwordTooShort: 'パスワードは6文字以上必要です。',
  emailRequired: 'メールアドレスを入力してください。',
  serverUrlRequired: 'サーバーURLを入力してください。',
  signInToAccess: 'チーム機能を利用するにはログインしてください',
},
```

**Step 2: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts src/i18n/locales/zh-TW.ts src/i18n/locales/ja.ts
git commit -m "i18n: add auth namespace translation keys for 4 locales"
```

---

## Task 2: Create TeamAuthModal component

**Files:**
- Create: `src/components/team/TeamAuthModal.tsx`

**Context:**

This is a full-screen modal that appears when a user needs to authenticate before using team features. It follows the existing modal pattern from `UpdateModal.tsx` (backdrop blur + centered card + `animate-spotlight-in`). The form has two modes: sign-in and sign-up, toggled by a text link at the bottom.

The component reuses `useCloudSyncStore` for all auth logic — it does NOT implement its own API calls.

**Design references:**
- Modal backdrop: `bg-black/30 backdrop-blur-sm animate-spotlight-overlay` (from UpdateModal)
- Card: `border border-border/60 bg-background/95 animate-spotlight-in` (from UpdateModal)
- Input: `w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30` (from WebDAVSettings)
- Button primary: `bg-primary/80 hover:bg-primary text-primary-foreground` (from WebDAVSettings)
- Error banner: `bg-destructive/10 border border-destructive/20` (from WebDAVSettings)
- Icons: `Loader2`, `LogIn`, `UserPlus`, `Eye`, `EyeOff`, `X`, `AlertCircle`, `Users` from lucide-react
- Animation: Framer Motion `whileHover={{ scale: 1.02 }}` / `whileTap={{ scale: 0.98 }}`
- Font: Sora (inherited from body)
- Radius: `rounded-ui-lg` for the card, `rounded-lg` for inputs/buttons

**Step 1: Create the component file**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, UserPlus, Eye, EyeOff, X, AlertCircle, Users, Loader2,
} from 'lucide-react';
import { useCloudSyncStore } from '../../stores/useCloudSyncStore';
import { useTranslation } from '../../i18n/useTranslation';

interface TeamAuthModalProps {
  onClose: () => void;
  onAuthenticated: () => void;
}

export function TeamAuthModal({ onClose, onAuthenticated }: TeamAuthModalProps) {
  const t = useTranslation();
  const {
    serverBaseUrl, setServerBaseUrl,
    email, setEmail,
    password, setPassword,
    isLoading, error,
    register, login, clearError,
    authStatus,
  } = useCloudSyncStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || error;

  const validate = (): boolean => {
    setLocalError(null);
    if (!serverBaseUrl.trim()) {
      setLocalError(t.auth.serverUrlRequired);
      return false;
    }
    if (!email.trim()) {
      setLocalError(t.auth.emailRequired);
      return false;
    }
    if (password.length < 6) {
      setLocalError(t.auth.passwordTooShort);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (displayError) {
      clearError();
      setLocalError(null);
    }

    const session = mode === 'signup' ? await register() : await login();
    if (session) {
      onAuthenticated();
    }
  };

  const switchMode = () => {
    setLocalError(null);
    clearError();
    setMode(mode === 'signin' ? 'signup' : 'signin');
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/10 ' +
    'focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 ' +
    'placeholder:text-muted-foreground/50 transition-all text-foreground';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-spotlight-overlay"
        onClick={onClose}
      />

      {/* Modal card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md mx-4 rounded-ui-lg shadow-2xl overflow-hidden border border-border/60 bg-background/95"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/60 transition-colors z-10"
        >
          <X size={16} className="text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            {t.auth.welcomeTitle}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {t.auth.welcomeSubtitle}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 pt-4 space-y-4">
          {/* Error banner */}
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle size={16} className="text-destructive shrink-0" />
                  <span className="text-sm text-destructive">{displayError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Server URL */}
          <div className="space-y-1.5">
            <label htmlFor="auth-server" className="text-xs font-medium text-muted-foreground">
              {t.auth.serverUrl}
            </label>
            <input
              id="auth-server"
              type="url"
              value={serverBaseUrl}
              onChange={(e) => setServerBaseUrl(e.target.value)}
              placeholder={t.auth.serverUrlPlaceholder}
              className={inputClass}
              autoComplete="url"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground">
              {t.auth.email}
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.emailPlaceholder}
              className={inputClass}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="text-xs font-medium text-muted-foreground">
              {t.auth.password}
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                className={inputClass + ' pr-10'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <motion.button
            type="submit"
            disabled={isLoading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className={
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ' +
              'bg-primary/90 text-primary-foreground shadow-ui-card ' +
              'hover:bg-primary/80 transition-colors ' +
              'disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : mode === 'signin' ? (
              <LogIn size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {isLoading
              ? (mode === 'signin' ? t.auth.signingIn : t.auth.signingUp)
              : (mode === 'signin' ? t.auth.signIn : t.auth.signUp)}
          </motion.button>

          {/* Mode switch */}
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signin' ? t.auth.noAccount : t.auth.hasAccount}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="text-primary hover:underline font-medium"
            >
              {mode === 'signin' ? t.auth.switchToSignUp : t.auth.switchToSignIn}
            </button>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/team/TeamAuthModal.tsx
git commit -m "feat: add TeamAuthModal component for team login/register"
```

---

## Task 3: Write tests for TeamAuthModal

**Files:**
- Create: `src/components/team/__tests__/TeamAuthModal.test.tsx`

**Context:**

Test the core behaviors: mode switching, form validation, submit calls, error display, close callback. Mock `useCloudSyncStore` and `useTranslation`.

**Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamAuthModal } from '../TeamAuthModal';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockRegister = vi.fn();
const mockLogin = vi.fn();
const mockClearError = vi.fn();
const mockSetServerBaseUrl = vi.fn();
const mockSetEmail = vi.fn();
const mockSetPassword = vi.fn();

let storeState = {
  serverBaseUrl: 'https://test.server.com',
  email: 'test@example.com',
  password: 'password123',
  isLoading: false,
  error: null as string | null,
  authStatus: 'anonymous' as string,
  setServerBaseUrl: mockSetServerBaseUrl,
  setEmail: mockSetEmail,
  setPassword: mockSetPassword,
  register: mockRegister,
  login: mockLogin,
  clearError: mockClearError,
};

vi.mock('../../../stores/useCloudSyncStore', () => ({
  useCloudSyncStore: (selector?: any) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

vi.mock('../../../i18n/useTranslation', () => ({
  useTranslation: () => ({
    auth: {
      signIn: 'Sign In',
      signUp: 'Sign Up',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      password: 'Password',
      passwordPlaceholder: 'At least 6 characters',
      serverUrl: 'Server URL',
      serverUrlPlaceholder: 'https://sync.example.com',
      welcomeTitle: 'Team Collaboration',
      welcomeSubtitle: 'Sign in to access team features.',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      switchToSignUp: 'Create one',
      switchToSignIn: 'Sign in',
      signingIn: 'Signing in...',
      signingUp: 'Creating account...',
      authError: 'Auth failed.',
      serverError: 'Server error.',
      passwordTooShort: 'Password too short.',
      emailRequired: 'Email required.',
      serverUrlRequired: 'Server URL required.',
      signInToAccess: 'Sign in to access team features',
    },
  }),
}));

describe('TeamAuthModal', () => {
  const onClose = vi.fn();
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storeState.error = null;
    storeState.isLoading = false;
    storeState.serverBaseUrl = 'https://test.server.com';
    storeState.email = 'test@example.com';
    storeState.password = 'password123';
  });

  it('renders sign-in mode by default', () => {
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);
    expect(screen.getByText('Team Collaboration')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('switches to sign-up mode when link is clicked', () => {
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);
    fireEvent.click(screen.getByText('Create one'));
    expect(screen.getByText('Sign Up')).toBeTruthy();
    expect(screen.getByText('Already have an account?')).toBeTruthy();
  });

  it('calls login on sign-in submit', async () => {
    mockLogin.mockResolvedValue({ token: 'abc', user_id: '1' });
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);

    fireEvent.submit(screen.getByText('Sign In').closest('form')!);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('calls register on sign-up submit', async () => {
    mockRegister.mockResolvedValue({ token: 'abc', user_id: '1' });
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);

    fireEvent.click(screen.getByText('Create one'));
    fireEvent.submit(screen.getByText('Sign Up').closest('form')!);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('shows validation error when password is too short', async () => {
    storeState.password = '123';
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);

    fireEvent.submit(screen.getByText('Sign In').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Password too short.')).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows store error when present', () => {
    storeState.error = 'Auth failed.';
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);
    expect(screen.getByText('Auth failed.')).toBeTruthy();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);
    // The backdrop is the first child div with the onClick
    const backdrop = document.querySelector('.animate-spotlight-overlay');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/blueberrycongee/Lumina-Note && npx vitest run src/components/team/__tests__/TeamAuthModal.test.tsx`

Expected: All 6 tests PASS. If any import paths differ (e.g. `useTranslation` location), adjust mocks to match actual project paths.

**Step 3: Commit**

```bash
git add src/components/team/__tests__/TeamAuthModal.test.tsx
git commit -m "test: add unit tests for TeamAuthModal"
```

---

## Task 4: Integrate TeamAuthModal into Sidebar team section

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Context:**

Currently, OrgSwitcher renders directly in the Sidebar (around line 249-273). We need to wrap the team section so that when `authStatus !== 'authenticated'`, clicking the team area opens TeamAuthModal instead of showing OrgSwitcher.

After successful authentication, the modal closes and OrgSwitcher + project list become visible. The Sidebar reads `authStatus` from `useCloudSyncStore`.

**Step 1: Add imports and state**

At the top of Sidebar.tsx, add:

```typescript
import { useState } from 'react'; // if not already imported
import { useCloudSyncStore } from '../../stores/useCloudSyncStore';
import { TeamAuthModal } from '../team/TeamAuthModal';
import { LogIn } from 'lucide-react'; // if not already imported
```

Add inside the Sidebar component body:

```typescript
const authStatus = useCloudSyncStore((s) => s.authStatus);
const [showAuthModal, setShowAuthModal] = useState(false);
```

**Step 2: Replace the team section rendering**

Find the existing team section block (approximately line 249-273, the `{/* Team Organization Section */}` comment). Replace it with:

```tsx
{/* Team Organization Section */}
<div className="px-2 py-1">
  {authStatus === 'authenticated' ? (
    <>
      <OrgSwitcher />
      {currentOrgId && projects.length > 0 && (
        <div className="mt-2">
          {/* existing project list code — keep as-is */}
        </div>
      )}
    </>
  ) : (
    <button
      onClick={() => setShowAuthModal(true)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
    >
      <LogIn size={16} />
      <span>{t.auth.signInToAccess}</span>
    </button>
  )}
</div>

{/* Auth Modal */}
{showAuthModal && (
  <TeamAuthModal
    onClose={() => setShowAuthModal(false)}
    onAuthenticated={() => setShowAuthModal(false)}
  />
)}
```

**Important:** Preserve all existing code inside the `currentOrgId && projects.length > 0` block. Only wrap the outer rendering with the auth check.

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: integrate TeamAuthModal into Sidebar team section"
```

---

## Task 5: Bridge auth session to useOrgStore

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (or the component that initializes OrgStore)

**Context:**

After authentication, `useCloudSyncStore` holds `session.token` and `serverBaseUrl`. The `useOrgStore` needs `baseUrl` and `token` to make API calls. We need a bridge effect that syncs these values.

**Step 1: Add a sync effect in Sidebar.tsx**

Inside the Sidebar component (after the existing state declarations), add:

```typescript
const cloudSession = useCloudSyncStore((s) => s.session);
const cloudBaseUrl = useCloudSyncStore((s) => s.serverBaseUrl);
const setOrgConnection = useOrgStore((s) => s.setConnection);

// Sync auth session to OrgStore
useEffect(() => {
  if (authStatus === 'authenticated' && cloudSession?.token && cloudBaseUrl) {
    setOrgConnection(cloudBaseUrl, cloudSession.token);
  }
}, [authStatus, cloudSession?.token, cloudBaseUrl, setOrgConnection]);
```

This ensures that whenever the user logs in (or the session is restored from localStorage on app start), the OrgStore gets the connection info and can fetch organizations.

**Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: bridge CloudSync auth session to OrgStore connection"
```

---

## Task 6: Add logout button to OrgSwitcher

**Files:**
- Modify: `src/components/team/OrgSwitcher.tsx`

**Context:**

Users need a way to log out from the team section. Add a small logout button at the bottom of the OrgSwitcher dropdown, or next to the user info. It calls `useCloudSyncStore.logout()`.

**Step 1: Add logout to OrgSwitcher**

Add imports:

```typescript
import { useCloudSyncStore } from '../../stores/useCloudSyncStore';
import { LogOut } from 'lucide-react'; // if not already imported
```

Inside the OrgSwitcher component, add:

```typescript
const logout = useCloudSyncStore((s) => s.logout);
const email = useCloudSyncStore((s) => s.email);
```

At the bottom of the OrgSwitcher dropdown (after the org list and create button), add a divider and logout button:

```tsx
{/* Divider */}
<div className="border-t border-border/40 my-1" />

{/* User info + Logout */}
<div className="flex items-center justify-between px-3 py-1.5">
  <span className="text-xs text-muted-foreground truncate max-w-[160px]">
    {email}
  </span>
  <button
    onClick={() => {
      logout();
    }}
    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
  >
    <LogOut size={12} />
    {t.auth.logout}
  </button>
</div>
```

**Step 2: Commit**

```bash
git add src/components/team/OrgSwitcher.tsx
git commit -m "feat: add user email display and logout button to OrgSwitcher"
```

---

## Task 7: Verify full flow and push

**Step 1: Run the full test suite**

```bash
cd /Users/blueberrycongee/Lumina-Note && npx vitest run
```

Expected: All tests pass, including the new TeamAuthModal tests.

**Step 2: Run TypeScript type check**

```bash
cd /Users/blueberrycongee/Lumina-Note && npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Start dev server and verify visually (if possible)**

```bash
cd /Users/blueberrycongee/Lumina-Note && npm run dev
```

Manual check:
- Sidebar shows "Sign in to access team features" button when not authenticated
- Clicking it opens the auth modal with sign-in form
- Can switch between sign-in and sign-up modes
- Form validates empty fields and short passwords
- After successful login, modal closes, OrgSwitcher appears
- OrgSwitcher dropdown shows email and logout button
- Logout returns to the "sign in" prompt

**Step 4: Push to remote main**

```bash
cd /Users/blueberrycongee/Lumina-Note && git push origin main
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | i18n: auth translation keys (4 locales) | 4 locale files |
| 2 | feat: TeamAuthModal component | 1 new component |
| 3 | test: TeamAuthModal unit tests | 1 test file |
| 4 | feat: Sidebar auth gate integration | Sidebar.tsx |
| 5 | feat: Bridge auth session to OrgStore | Sidebar.tsx |
| 6 | feat: Logout button in OrgSwitcher | OrgSwitcher.tsx |
| 7 | verify + push to origin/main | - |

**Total commits: 6** (atomic, each self-contained)
**New files: 2** (component + test)
**Modified files: 6** (4 locales + Sidebar + OrgSwitcher)
**Backend changes: 0** (auth API already complete)
