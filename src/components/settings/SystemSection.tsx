import { useEffect, useState } from "react";
import { getVersion } from "@/lib/host";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { VscodeAiExtensionsSection } from "./VscodeAiExtensionsSection";

interface SystemSectionProps {
  onOpenUpdateModal: () => void;
}

export function SystemSection({ onOpenUpdateModal }: SystemSectionProps) {
  const { t } = useLocaleStore();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("dev"));
  }, []);

  return (
    <>
      {/* 软件更新 */}
      <section className="space-y-4" data-testid="settings-section-update">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t.updateChecker.title}
        </h3>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/60 p-4">
          <div className="space-y-1">
            <p className="font-medium">
              {t.updateChecker.versionLabel.replace(
                "{version}",
                appVersion || "...",
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {t.settingsModal.softwareUpdateDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenUpdateModal}
            data-testid="settings-open-update-modal"
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            title={t.settingsModal.softwareUpdateOpen}
          >
            {t.settingsModal.softwareUpdateOpen}
          </button>
        </div>
      </section>

      <VscodeAiExtensionsSection />

      {/* 关于 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t.settingsModal.about}
        </h3>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Lumina Note</p>
            <p className="text-sm text-muted-foreground">
              {t.settingsModal.appDescription}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            v{appVersion || "..."}
          </span>
        </div>
      </section>
    </>
  );
}
