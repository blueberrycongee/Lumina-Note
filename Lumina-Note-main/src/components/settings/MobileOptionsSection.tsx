import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useAgentProfileStore } from "@/stores/useAgentProfileStore";
import { useFileStore } from "@/stores/useFileStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";

export function MobileOptionsSection() {
  const { t } = useLocaleStore();
  const { workspaces, currentWorkspaceId, setCurrentWorkspace, removeWorkspace } = useWorkspaceStore();
  const { profiles, currentProfileId, createProfileFromCurrent, setCurrentProfile, removeProfile } = useAgentProfileStore();
  const { setVaultPath } = useFileStore();
  const { syncMobileOptions, syncMobileSessions, autoApprove } = useRustAgentStore();
  const [profileName, setProfileName] = useState("");
  const [applyToDesktop, setApplyToDesktop] = useState(false);

  const handleSelectWorkspace = async (id: string) => {
    const workspace = workspaces.find(w => w.id === id);
    if (!workspace) return;
    setCurrentWorkspace(id);
    await setVaultPath(workspace.path);
    void syncMobileOptions();
  };

  const handleAddProfile = () => {
    const created = createProfileFromCurrent(profileName, autoApprove);
    if (!created) return;
    setProfileName("");
    void syncMobileOptions();
    void syncMobileSessions();
  };

  const handleSelectProfile = (id: string) => {
    setCurrentProfile(id, applyToDesktop);
    void syncMobileOptions();
    void syncMobileSessions();
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/90">
            {t.settingsModal.mobileOptionsTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t.settingsModal.mobileOptionsDesc}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void syncMobileOptions();
            void syncMobileSessions();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw size={12} />
          {t.settingsModal.mobileOptionsSync}
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {t.settingsModal.mobileWorkspaceList}
        </div>
        <div className="space-y-1">
          {workspaces.length === 0 && (
            <div className="text-xs text-muted-foreground">
              {t.settingsModal.mobileWorkspaceEmpty}
            </div>
          )}
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
            >
              <button
                type="button"
                className={`flex-1 text-left ${workspace.id === currentWorkspaceId ? "text-primary" : "text-foreground/80"}`}
                onClick={() => void handleSelectWorkspace(workspace.id)}
              >
                {workspace.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeWorkspace(workspace.id);
                  void syncMobileOptions();
                  void syncMobileSessions();
                }}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t.settingsModal.mobileProfileList}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t.settingsModal.mobileProfileNamePlaceholder}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={handleAddProfile}
            disabled={!profileName.trim()}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-60"
          >
            {t.settingsModal.mobileProfileAdd}
          </button>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={applyToDesktop}
            onChange={(e) => setApplyToDesktop(e.target.checked)}
          />
          {t.settingsModal.mobileProfileApplyToDesktop}
        </label>
        <div className="space-y-1">
          {profiles.length === 0 && (
            <div className="text-xs text-muted-foreground">
              {t.settingsModal.mobileProfileEmpty}
            </div>
          )}
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
            >
              <button
                type="button"
                className={`flex-1 text-left ${profile.id === currentProfileId ? "text-primary" : "text-foreground/80"}`}
                onClick={() => handleSelectProfile(profile.id)}
              >
                {profile.name} ({profile.config.provider}/{profile.config.model})
              </button>
              <button
                type="button"
                onClick={() => {
                  removeProfile(profile.id);
                  void syncMobileOptions();
                  void syncMobileSessions();
                }}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
