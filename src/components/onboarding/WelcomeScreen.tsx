import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Bot, FileText, FolderOpen, HardDrive } from "lucide-react";
import { TitleBar } from "@/components/layout/TitleBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useMacTopChromeEnabled } from "@/components/layout/MacTopChrome";
import { WindowControls } from "@/components/layout/WindowControls";
import { Button } from "@/components/ui/button";
import { resolveRendererAssetUrl } from "@/lib/appAsset";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface WelcomeScreenProps {
  onOpenVault: () => void;
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.2, 0.9, 0.1, 1] },
  },
};

const logoVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.2, 0.9, 0.1, 1] },
  },
};

const features = [
  { icon: FileText, titleKey: "featureMarkdown", descKey: "featureMarkdownDesc" },
  { icon: Bot, titleKey: "featureAI", descKey: "featureAIDesc" },
  { icon: HardDrive, titleKey: "featureLocal", descKey: "featureLocalDesc" },
] as const;

export function WelcomeScreen({ onOpenVault }: WelcomeScreenProps) {
  const { t } = useLocaleStore();
  const showMacWindowInset = useMacTopChromeEnabled();
  const prefersReducedMotion = useReducedMotion();
  const logoUrl = resolveRendererAssetUrl("lumina.png");

  return (
    <div className="h-full flex flex-col bg-background">
      <TitleBar />

      <div className="relative flex-1 ui-app-bg overflow-hidden flex flex-col">
        {showMacWindowInset ? (
          <div
            className="flex items-center px-4 py-2"
            data-tauri-drag-region
            data-testid="welcome-top-row"
          >
            <div className="w-16 flex justify-center shrink-0" data-tauri-drag-region="false">
              <WindowControls />
            </div>
            <div className="flex-1" />
            <LanguageSwitcher compact stopPropagation />
          </div>
        ) : (
          <LanguageSwitcher
            className="absolute top-4 right-4 z-10"
            showLabel
          />
        )}

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <motion.div
            variants={containerVariants}
            initial={prefersReducedMotion ? "visible" : "hidden"}
            animate="visible"
            className="flex flex-col items-center gap-6 max-w-lg"
          >
            {/* Logo */}
            <motion.div variants={logoVariants}>
              <img
                src={logoUrl}
                alt="Lumina Note"
                className="w-20 h-20"
              />
            </motion.div>

            {/* Title */}
            <motion.h1
              variants={fadeUpVariants}
              className="text-4xl font-semibold tracking-tight text-foreground"
            >
              {t.welcome.title}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeUpVariants}
              className="text-base text-muted-foreground text-center max-w-[360px] -mt-2"
            >
              {t.welcome.subtitle}
            </motion.p>

            {/* Feature highlights */}
            <motion.div
              variants={fadeUpVariants}
              className="flex gap-8 mt-2"
              data-testid="feature-highlights"
            >
              {features.map(({ icon: Icon, titleKey, descKey }) => (
                <div
                  key={titleKey}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <div className="w-10 h-10 rounded-ui-md bg-accent flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {t.welcome[titleKey]}
                  </span>
                  <span className="text-xs text-muted-foreground max-w-[140px]">
                    {t.welcome[descKey]}
                  </span>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.div variants={fadeUpVariants} className="mt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={onOpenVault}
                className="w-64 justify-center"
              >
                <FolderOpen className="w-5 h-5" />
                {t.welcome.openFolder}
              </Button>
            </motion.div>

            {/* Hint */}
            <motion.p
              variants={fadeUpVariants}
              className="text-sm text-muted-foreground text-center"
            >
              {t.welcome.selectFolder}
            </motion.p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
