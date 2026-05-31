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

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left sidebar: Recent vaults */}
          <div className="w-[320px] shrink-0 border-r border-border flex flex-col">
            <RecentVaultList
              vaults={vaults}
              onSelect={(path) => onOpenVault(path)}
              onRemove={removeVault}
              onClear={clearVaults}
            />
          </div>

          {/* Right pane */}
          <div className="flex-1 flex items-center justify-center px-10 py-10 overflow-y-auto">
            <motion.div
              variants={containerVariants}
              initial={prefersReducedMotion ? "visible" : "hidden"}
              animate="visible"
              className="flex w-full max-w-[560px] -translate-y-7 flex-col"
            >
              {/* Logo */}
              <motion.div
                variants={fadeUpVariants}
                className="-translate-y-11 mb-[76px] flex items-center gap-[22px]"
              >
                <img
                  src={logoUrl}
                  alt="Lumina Note"
                  className="h-[68px] w-[68px] rounded-ui-xl"
                />

                {/* Title */}
                <h1 className="text-[36px] font-semibold leading-tight tracking-normal text-foreground">
                  {t.welcome.title}
                </h1>
              </motion.div>

              <div className="min-h-[150px]">
                <AnimatePresence mode="wait">
                  {view === "welcome" ? (
                    <motion.div
                      key="welcome"
                      variants={fadeUpVariants}
                      initial={prefersReducedMotion ? "visible" : "hidden"}
                      animate="visible"
                      exit={
                        prefersReducedMotion
                          ? {}
                          : { opacity: 0, transition: { duration: 0.15 } }
                      }
                      className="w-full flex flex-col gap-[18px]"
                    >
                      <ActionCard
                        icon={FolderOpen}
                        title={t.welcome.openFolder}
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
                          action={{
                            label: t.welcome.newVaultButton,
                            variant: "secondary",
                            onClick: handleShowCreate,
                          }}
                        />
                      )}
                    </motion.div>
                  ) : (
                    <motion.form
                      key="create"
                      onSubmit={handleCreateSubmit}
                      variants={viewVariants}
                      initial={prefersReducedMotion ? "center" : "enter"}
                      animate="center"
                      exit={
                        prefersReducedMotion
                          ? {}
                          : { opacity: 0, transition: { duration: 0.15 } }
                      }
                      transition={{ duration: 0.2, ease: [0.2, 0.9, 0.1, 1] }}
                      className="w-full rounded-ui-xl bg-muted/55 p-3"
                    >
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <h2 className="text-base font-semibold leading-6 tracking-normal text-foreground">
                              {t.welcome.createVault}
                            </h2>
                          </div>
                          <p className="mt-1 max-w-[420px] text-sm text-muted-foreground">
                            {t.welcome.createVaultDesc}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleBack}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-ui-md px-2 text-sm text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {t.common.cancel}
                        </button>
                      </div>

                      <div className="flex h-11 w-full items-center gap-2 rounded-ui-lg bg-background px-2 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.58)]">
                        <input
                          type="text"
                          value={vaultName}
                          onChange={(e) => setVaultName(e.target.value)}
                          placeholder={t.welcome.vaultNamePlaceholder}
                          className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
                          autoFocus
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          type="submit"
                          disabled={!vaultName.trim()}
                          className="h-8 shrink-0 px-4"
                        >
                          {t.common.create}
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
