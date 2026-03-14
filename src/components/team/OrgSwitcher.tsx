import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrgStore } from '@/stores/useOrgStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Plus, Building2, Check, Loader2, LogOut } from 'lucide-react';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-blue-500/20 text-blue-400',
  member: 'bg-green-500/20 text-green-400',
  guest: 'bg-zinc-500/20 text-zinc-400',
};

export function OrgSwitcher() {
  const { t } = useLocaleStore();
  const { orgs, currentOrgId, switchOrg, createOrg } = useOrgStore(
    useShallow((s) => ({
      orgs: s.orgs,
      currentOrgId: s.currentOrgId,
      switchOrg: s.switchOrg,
      createOrg: s.createOrg,
    })),
  );

  const logout = useCloudSyncStore((s) => s.logout);
  const email = useCloudSyncStore((s) => s.email);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when entering create mode
  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);

  const handleSwitch = useCallback(
    (orgId: string) => {
      if (orgId === currentOrgId) {
        setOpen(false);
        return;
      }
      switchOrg(orgId);
      setOpen(false);
    },
    [currentOrgId, switchOrg],
  );

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await createOrg(trimmed);
      setNewName('');
      setCreating(false);
      // Automatically switch to the newly created org
      await switchOrg(created.id);
      setOpen(false);
    } catch {
      // Error is already set in store
    } finally {
      setSubmitting(false);
    }
  }, [newName, submitting, createOrg, switchOrg]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCreate();
      } else if (e.key === 'Escape') {
        setCreating(false);
        setNewName('');
      }
    },
    [handleCreate],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 shadow-sm transition-colors hover:bg-zinc-700/80 active:bg-zinc-700"
      >
        <Building2 size={16} className="shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate text-left">
          {currentOrg ? currentOrg.name : t.team.selectOrganization}
        </span>
        {currentOrg && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${roleBadgeClass[currentOrg.role] ?? roleBadgeClass.guest}`}
          >
            {currentOrg.role === 'admin' ? t.team.admin : currentOrg.role === 'member' ? t.team.member : t.team.guest}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 shadow-lg">
          {/* Org list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {orgs.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">{t.team.noOrganizations}</div>
            )}
            {orgs.map((org) => {
              const isSelected = org.id === currentOrgId;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSwitch(org.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-zinc-700/60 text-zinc-100'
                      : 'text-zinc-300 hover:bg-zinc-700/40'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${roleBadgeClass[org.role] ?? roleBadgeClass.guest}`}
                  >
                    {org.role === 'admin' ? t.team.admin : org.role === 'member' ? t.team.member : t.team.guest}
                  </span>
                  {isSelected && <Check size={14} className="shrink-0 text-blue-400" />}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-700" />

          {/* Create section */}
          {creating ? (
            <div className="flex items-center gap-1.5 px-2 py-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.team.orgNamePlaceholder}
                disabled={submitting}
                className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || submitting}
                className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : t.team.ok}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700/40 hover:text-zinc-200"
            >
              <Plus size={14} />
              <span>{t.team.createOrganization}</span>
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-zinc-700 my-1" />

          {/* User info + Logout */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-zinc-500 truncate max-w-[160px]">
              {email}
            </span>
            <button
              type="button"
              onClick={() => { logout(); }}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              <LogOut size={12} />
              {t.auth.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
