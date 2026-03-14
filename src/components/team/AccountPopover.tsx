import { useEffect, useRef } from 'react';
import { LogOut, Mail } from 'lucide-react';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface AccountPopoverProps {
  onClose: () => void;
}

export function AccountPopover({ onClose }: AccountPopoverProps) {
  const { t } = useLocaleStore();
  const email = useCloudSyncStore((s) => s.session?.user?.email);
  const serverBaseUrl = useCloudSyncStore((s) => s.serverBaseUrl);
  const logout = useCloudSyncStore((s) => s.logout);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-0 left-full ml-2 z-50 w-56 rounded-lg border border-border/60 bg-background/95 backdrop-blur-md shadow-ui-card overflow-hidden"
    >
      <div className="px-3 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 text-sm text-foreground font-medium truncate">
          <Mail size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{email}</span>
        </div>
        {serverBaseUrl && (
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {serverBaseUrl}
          </div>
        )}
      </div>
      <div className="p-1">
        <button
          onClick={() => {
            logout();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut size={14} />
          {t.auth.logout}
        </button>
      </div>
    </div>
  );
}
