import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamAuthModal } from '../TeamAuthModal';

// ---------- mock locale store ----------
const mockT = {
  auth: {
    welcomeTitle: 'Welcome',
    welcomeSubtitle: 'Sign in to continue',
    serverUrl: 'Server URL',
    serverUrlPlaceholder: 'https://example.com',
    serverUrlRequired: 'Server URL is required',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    emailRequired: 'Email is required',
    password: 'Password',
    passwordPlaceholder: 'Enter password',
    passwordTooShort: 'Password must be at least 8 characters',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signingIn: 'Signing in...',
    signingUp: 'Signing up...',
    hasAccount: 'Already have an account?',
    noAccount: "Don't have an account?",
    switchToSignIn: 'Sign in',
    switchToSignUp: 'Sign up',
  },
};

vi.mock('@/stores/useLocaleStore', () => ({
  useLocaleStore: () => ({ t: mockT }),
}));

// ---------- mock cloud sync store ----------
const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockClearError = vi.fn();
const mockSetServerBaseUrl = vi.fn();
const mockSetEmail = vi.fn();
const mockSetPassword = vi.fn();

let mockStoreState: Record<string, unknown>;

function resetStoreState(overrides: Record<string, unknown> = {}) {
  mockStoreState = {
    serverBaseUrl: 'https://server.test',
    setServerBaseUrl: mockSetServerBaseUrl,
    email: 'user@test.com',
    setEmail: mockSetEmail,
    password: 'password123',
    setPassword: mockSetPassword,
    isLoading: false,
    error: null,
    register: mockRegister,
    login: mockLogin,
    clearError: mockClearError,
    ...overrides,
  };
}

vi.mock('@/stores/useCloudSyncStore', () => ({
  useCloudSyncStore: (selector: unknown) => {
    if (typeof selector === 'function') return (selector as (s: typeof mockStoreState) => unknown)(mockStoreState);
    return mockStoreState;
  },
}));

// ---------- mock framer-motion ----------
vi.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
        return React.createElement('div', { ...rest, ref });
      }),
      button: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
        return React.createElement('button', { ...rest, ref });
      }),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// ---------- mock lucide-react ----------
vi.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name: string) => (props: Record<string, unknown>) => React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    LogIn: icon('LogIn'),
    UserPlus: icon('UserPlus'),
    Eye: icon('Eye'),
    EyeOff: icon('EyeOff'),
    X: icon('X'),
    AlertCircle: icon('AlertCircle'),
    Users: icon('Users'),
    Loader2: icon('Loader2'),
  };
});

// ---------- tests ----------
describe('TeamAuthModal', () => {
  const onClose = vi.fn();
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStoreState();
  });

  function renderModal() {
    return render(<TeamAuthModal onClose={onClose} onAuthenticated={onAuthenticated} />);
  }

  // 1. Renders sign-in mode by default
  it('renders sign-in mode by default with welcome title and Sign In button', () => {
    renderModal();

    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
    expect(screen.getByText('Sign up')).toBeInTheDocument();
  });

  // 2. Switches to sign-up mode when toggle link is clicked
  it('switches to sign-up mode when toggle link is clicked', () => {
    renderModal();

    fireEvent.click(screen.getByText('Sign up'));

    expect(screen.getByText('Sign Up')).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(mockClearError).toHaveBeenCalled();
  });

  // 3. Calls login() on sign-in form submit, calls onAuthenticated on success
  it('calls login() on sign-in submit and onAuthenticated on success', async () => {
    mockLogin.mockResolvedValue({ token: 'abc' });
    renderModal();

    fireEvent.submit(screen.getByText('Sign In').closest('form')!);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  // 4. Calls register() on sign-up form submit, calls onAuthenticated on success
  it('calls register() on sign-up submit and onAuthenticated on success', async () => {
    mockRegister.mockResolvedValue({ token: 'xyz' });
    renderModal();

    // Switch to sign-up mode
    fireEvent.click(screen.getByText('Sign up'));

    fireEvent.submit(screen.getByText('Sign Up').closest('form')!);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  // 5. Shows validation error when password is too short (does NOT call login)
  it('shows validation error when password is too short and does not call login', async () => {
    resetStoreState({ password: '123' });
    renderModal();

    fireEvent.submit(screen.getByText('Sign In').closest('form')!);

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // 6. Shows store error when present
  it('shows store error when present', () => {
    resetStoreState({ error: 'Invalid credentials' });
    renderModal();

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  // 7. Calls onClose when backdrop is clicked
  it('calls onClose when backdrop is clicked', () => {
    renderModal();

    // The backdrop is the outermost div with the fixed class
    const backdrop = screen.getByText('Welcome').closest('.fixed')!;
    // Click directly on the backdrop (target === currentTarget)
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when clicking inside the card', () => {
    renderModal();

    fireEvent.click(screen.getByText('Welcome'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
