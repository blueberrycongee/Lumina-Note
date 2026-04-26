import { useState, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { FolderOpen, FolderPlus, ArrowLeft } from "lucide-react";
import { openDialog } from "@/lib/host";
import { TitleBar } from "@/components/layout/TitleBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useMacTopChromeEnabled } from "@/components/layout/MacTopChrome";
import { WindowControls } from "@/components/layout/WindowControls";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./ActionCard";
import { RecentVaultList } from "./RecentVaultList";
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

const viewVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
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

  const [view, setView] = useState<"welcome" | "create">("welcome");
  const [vaultName, setVaultName] = useState("");

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

  const handleShowCreate = useCallback(() => {
    setVaultName("");
    setView("create");
  }, []);

  const handleBack = useCallback(() => {
    setVaultName("");
    setView("welcome");
  }, []);

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = vaultName.trim();
      if (trimmed && onCreateVault) {
        onCreateVault(trimmed);
      }
    },
    [vaultName, onCreateVault],
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

          {/* Right pane */}
          <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
            <AnimatePresence mode="wait">
              {view === "welcome" ? (
                <motion.div
                  key="welcome"
                  variants={containerVariants}
                  initial={prefersReducedMotion ? "visible" : "hidden"}
                  animate="visible"
                  exit={
                    prefersReducedMotion
                      ? {}
                      : { opacity: 0, transition: { duration: 0.15 } }
                  }
                  className="flex flex-col items-center gap-6 w-full max-w-[640px]"
                >
                  {/* Logo */}
                  <motion.div variants={fadeUpVariants}>
                    <img
                      src={logoUrl}
                      alt="Lumina Note"
                      className="w-20 h-20"
                    />
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
                          onClick: handleShowCreate,
                        }}
                      />
                    )}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="create"
                  variants={viewVariants}
                  initial={prefersReducedMotion ? "center" : "enter"}
                  animate="center"
                  exit={
                    prefersReducedMotion
                      ? {}
                      : { opacity: 0, transition: { duration: 0.15 } }
                  }
                  transition={{ duration: 0.2, ease: [0.2, 0.9, 0.1, 1] }}
                  className="flex flex-col items-center gap-6 w-full max-w-[640px]"
                >
                  {/* Back button */}
                  <div className="w-full">
                    <button
                      onClick={handleBack}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      {t.common.cancel}
                    </button>
                  </div>

                  {/* Icon */}
                  <div className="w-16 h-16 rounded-ui-lg bg-accent flex items-center justify-center">
                    <FolderPlus className="w-8 h-8 text-primary" />
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {t.welcome.createVault}
                  </h2>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground text-center max-w-[360px] -mt-2">
                    {t.welcome.createVaultDesc}
                  </p>

                  {/* Form */}
                  <form
                    onSubmit={handleCreateSubmit}
                    className="w-full flex flex-col gap-3"
                  >
                    <input
                      type="text"
                      value={vaultName}
                      onChange={(e) => setVaultName(e.target.value)}
                      placeholder={t.welcome.vaultNamePlaceholder}
                      className="w-full h-11 px-4 rounded-ui-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      autoFocus
                    />
                    <Button
                      variant="primary"
                      size="md"
                      type="submit"
                      disabled={!vaultName.trim()}
                      className="w-full"
                    >
                      {t.common.create}
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
