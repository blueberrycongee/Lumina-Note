import { useState, useCallback } from 'react';
import { useOrgStore } from '@/stores/useOrgStore';
import { useShallow } from 'zustand/react/shallow';
import { X, UserPlus, Trash2, Loader2 } from 'lucide-react';
import type { OrgRole } from '@/services/team/types';

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-blue-500/20 text-blue-400',
  member: 'bg-green-500/20 text-green-400',
  guest: 'bg-zinc-500/20 text-zinc-400',
};

const roleOptions: OrgRole[] = ['admin', 'member', 'guest'];

interface OrgSettingsPanelProps {
  onClose: () => void;
}

export function OrgSettingsPanel({ onClose }: OrgSettingsPanelProps) {
  const { currentOrg, orgs, currentOrgId, updateOrg, addMember, removeMember } = useOrgStore(
    useShallow((s) => ({
      currentOrg: s.currentOrg,
      orgs: s.orgs,
      currentOrgId: s.currentOrgId,
      updateOrg: s.updateOrg,
      addMember: s.addMember,
      removeMember: s.removeMember,
    })),
  );

  const currentOrgSummary = orgs.find((o) => o.id === currentOrgId);
  const isAdmin = currentOrgSummary?.role === 'admin';

  // Name editing state
  const [orgName, setOrgName] = useState(currentOrg?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Remove state
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleSaveName = useCallback(async () => {
    const trimmed = orgName.trim();
    if (!trimmed || !currentOrgId || savingName) return;
    if (trimmed === currentOrg?.name) return;
    setSavingName(true);
    setNameError(null);
    try {
      await updateOrg(currentOrgId, trimmed);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }, [orgName, currentOrgId, currentOrg?.name, savingName, updateOrg]);

  const handleInvite = useCallback(async () => {
    const trimmed = inviteEmail.trim();
    if (!trimmed || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      await addMember(trimmed, inviteRole);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, inviting, addMember]);

  const handleRemove = useCallback(
    async (userId: string) => {
      if (removingUserId) return;
      setRemovingUserId(userId);
      setRemoveError(null);
      try {
        await removeMember(userId);
      } catch (err) {
        setRemoveError(err instanceof Error ? err.message : String(err));
      } finally {
        setRemovingUserId(null);
      }
    },
    [removingUserId, removeMember],
  );

  if (!currentOrg) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/80 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Organization Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">No organization selected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/80 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Organization Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* Name section */}
      <div className="border-b border-zinc-700 px-4 py-3">
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Name</label>
        <div className="flex items-center gap-2">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
            }}
            disabled={!isAdmin || savingName}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500 disabled:opacity-50"
          />
          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveName}
              disabled={!orgName.trim() || orgName.trim() === currentOrg.name || savingName}
              className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {savingName ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
          )}
        </div>
        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
      </div>

      {/* Members section */}
      <div className="px-4 py-3">
        <label className="mb-2 block text-xs font-medium text-zinc-400">Members</label>

        {/* Member list */}
        <div className="mb-3 max-h-48 overflow-y-auto rounded border border-zinc-700 bg-zinc-900/50">
          {currentOrg.members.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">No members</div>
          ) : (
            currentOrg.members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center gap-2 border-b border-zinc-700/50 px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                  {member.email}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${roleBadgeClass[member.role] ?? roleBadgeClass.guest}`}
                >
                  {member.role}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.user_id)}
                    disabled={removingUserId === member.user_id}
                    className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
                    title="Remove member"
                  >
                    {removingUserId === member.user_id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {removeError && <p className="mb-2 text-xs text-red-400">{removeError}</p>}

        {/* Invite section (admin only) */}
        {isAdmin && (
          <>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              <UserPlus size={12} className="mr-1 inline-block" />
              Invite Member
            </label>
            <div className="flex items-center gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInvite();
                }}
                placeholder="user@email.com"
                disabled={inviting}
                className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={inviting}
                className="shrink-0 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500 disabled:opacity-50"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || inviting}
                className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                {inviting ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </button>
            </div>
            {inviteError && <p className="mt-1 text-xs text-red-400">{inviteError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
