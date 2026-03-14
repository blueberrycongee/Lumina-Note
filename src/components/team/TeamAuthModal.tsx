import { useState, type FormEvent, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  Users,
  Loader2,
} from 'lucide-react';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface TeamAuthModalProps {
  onClose: () => void;
  onAuthenticated: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/10 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50 transition-all text-foreground';

export function TeamAuthModal({ onClose, onAuthenticated }: TeamAuthModalProps) {
  const { t } = useLocaleStore();

  const {
    serverBaseUrl,
    setServerBaseUrl,
    email,
    setEmail,
    password,
    setPassword,
    isLoading,
    error,
    register,
    login,
    clearError,
  } = useCloudSyncStore(
    useShallow((s) => ({
      serverBaseUrl: s.serverBaseUrl,
      setServerBaseUrl: s.setServerBaseUrl,
      email: s.email,
      setEmail: s.setEmail,
      password: s.password,
      setPassword: s.setPassword,
      isLoading: s.isLoading,
      error: s.error,
      register: s.register,
      login: s.login,
      clearError: s.clearError,
    })),
  );

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || error;

  function validate(): boolean {
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
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    clearError();
    setLocalError(null);

    const session = mode === 'signup' ? await register() : await login();
    if (session) {
      onAuthenticated();
    }
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const isSignUp = mode === 'signup';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-spotlight-overlay"
      onClick={handleBackdropClick}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md mx-4 border border-border/60 bg-background/95 rounded-ui-lg shadow-ui-card overflow-hidden"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="px-6 pt-8 pb-6">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Users size={24} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t.auth.welcomeTitle}
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-1 max-w-xs">
              {t.auth.welcomeSubtitle}
            </p>
          </div>

          {/* Error banner */}
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mb-4"
              >
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{displayError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Server URL */}
            <div>
              <label
                htmlFor="team-server-url"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t.auth.serverUrl}
              </label>
              <input
                id="team-server-url"
                type="url"
                value={serverBaseUrl}
                onChange={(e) => setServerBaseUrl(e.target.value)}
                placeholder={t.auth.serverUrlPlaceholder}
                autoComplete="url"
                className={INPUT_CLASS}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="team-email"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t.auth.email}
              </label>
              <input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                autoComplete="email"
                className={INPUT_CLASS}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="team-password"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t.auth.password}
              </label>
              <div className="relative">
                <input
                  id="team-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.passwordPlaceholder}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className={INPUT_CLASS + ' pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary/90 text-primary-foreground shadow-ui-card hover:bg-primary/80 disabled:opacity-60 disabled:pointer-events-none transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{isSignUp ? t.auth.signingUp : t.auth.signingIn}</span>
                </>
              ) : (
                <>
                  {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
                  <span>{isSignUp ? t.auth.signUp : t.auth.signIn}</span>
                </>
              )}
            </motion.button>
          </form>

          {/* Mode toggle */}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <span>{isSignUp ? t.auth.hasAccount : t.auth.noAccount} </span>
            <button
              type="button"
              onClick={() => {
                setMode(isSignUp ? 'signin' : 'signup');
                setLocalError(null);
                clearError();
              }}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? t.auth.switchToSignIn : t.auth.switchToSignUp}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
