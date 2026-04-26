import { useState, useCallback } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { FolderOpen, FolderPlus } from "lucide-react";
import { openDialog } from "@/lib/host";
import { TitleBar } from "@/components/layout/TitleBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useMacTopChromeEnabled } from "@/components/layout/MacTopChrome";
import { WindowControls } from "@/components/layout/WindowControls";
import { ActionCard } from "./ActionCard";
import { RecentVaultList } from "./RecentVaultList";
import { VaultNamePrompt } from "./VaultNamePrompt";
import { useRecentVaultStore } from "@/stores/useRecentVaultStore";
import { resolveRendererAssetUrl } from "@/lib/appAsset";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface WelcomeScreenProps {
  onOpenVault: (path?: string) => void;
  onCreateVault?: (name: string) => void;
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.2, 0.9, 0.1, 1] },
  },
};

export function WelcomeScreen({
  onOpenVault,
  onCreateVault,
}: WelcomeScreenProps) {
  const { t } = useLocaleStore();
  const showMacWindowInset = useMacTopChromeEnabled();
  const prefersReducedMotion = useReducedMotion();
  const logoUrl = resolveRendererAssetUrl("lumina.png");

  const vaults = useRecentVaultStore((s) => s.vaults);
  const removeVault = useRecentVaultStore((s) => s.removeVault);
  const clearVaults = useRecentVaultStore((s) => s.clearVaults);

  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const handleOpenExisting = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.welcome.openFolder,
      });
      if (selected && typeof selected === "string") {
        onOpenVault(selected);
      }
    } catch (error) {
      console.error("[WelcomeScreen] Open folder dialog failed:", error);
    }
  }, [onOpenVault, t.welcome.openFolder]);

  const handleCreateVault = useCallback(() => {
    setShowNamePrompt(true);
  }, []);

  const handleNameSubmit = useCallback(
    (name: string) => {
      if (onCreateVault) {
        onCreateVault(name);
      }
      setShowNamePrompt(false);
    },
    [onCreateVault],
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <TitleBar />

      <div className="relative flex-1 overflow-hidden flex flex-col">
        {showMacWindowInset ? (
          <div
            className="flex items-center px-4 py-2"
            data-tauri-drag-region
            data-testid="welcome-top-row"
          >
            <div
              className="w-16 flex justify-center shrink-0"
              data-tauri-drag-region="false"
            >
              <WindowControls />
            </div>
            <div className="flex-1" />
            <LanguageSwitcher compact stopPropagation />
          </div>
        ) : (
          <LanguageSwitcher className="absolute top-4 right-4 z-10" showLabel />
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar: Recent vaults */}
          <div className="w-[280px] shrink-0 border-r border-border bg-ui-surface flex flex-col">
            <RecentVaultList
              vaults={vaults}
              onSelect={(path) => onOpenVault(path)}
              onRemove={removeVault}
              onClear={clearVaults}
            />
          </div>

          {/* Right pane: Brand + Actions */}
          <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
            <motion.div
              variants={containerVariants}
              initial={prefersReducedMotion ? "visible" : "hidden"}
              animate="visible"
              className="flex flex-col items-center gap-6 w-full max-w-[640px]"
            >
              {/* Logo */}
              <motion.div variants={fadeUpVariants}>
                <img src={logoUrl} alt="Lumina Note" className="w-20 h-20" />
              </motion.div>

              {/* Title */}
              <motion.h1
                variants={fadeUpVariants}
                className="text-3xl font-semibold tracking-tight text-foreground"
              >
                {t.welcome.title}
              </motion.h1>

              {/* Action cards */}
              <motion.div
                variants={fadeUpVariants}
                className="w-full flex flex-col gap-3 mt-2"
              >
                <ActionCard
                  icon={FolderOpen}
                  title={t.welcome.openFolder}
                  description={t.welcome.selectFolder}
                  action={{
                    label: t.common.open,
                    variant: "primary",
                    onClick: handleOpenExisting,
                  }}
                />
                {onCreateVault && (
                  <ActionCard
                    icon={FolderPlus}
                    title={t.welcome.createVault}
                    description={t.welcome.createVaultDesc}
                    action={{
                      label: t.welcome.newVaultButton,
                      variant: "secondary",
                      onClick: handleCreateVault,
                    }}
                  />
                )}
              </motion.div>

              {/* Footer */}
              <motion.div
                variants={fadeUpVariants}
                className="flex items-center justify-between w-full mt-4 text-xs text-muted-foreground"
              >
                <span>Lumina Note</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <VaultNamePrompt
        isOpen={showNamePrompt}
        onSubmit={handleNameSubmit}
        onCancel={() => setShowNamePrompt(false)}
      />
    </div>
  );
}
