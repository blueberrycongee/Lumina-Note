import { motion } from "framer-motion";
import { FolderOpen, Sparkles } from "lucide-react";
import { TitleBar } from "@/components/layout/TitleBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface WelcomeScreenProps {
  onOpenVault: () => void;
}

export function WelcomeScreen({ onOpenVault }: WelcomeScreenProps) {
  const { t } = useLocaleStore();

  return (
    <div className="h-full flex flex-col bg-background">
      <TitleBar />

      <div className="relative flex-1 ui-app-bg overflow-hidden">
        <LanguageSwitcher className="absolute top-4 right-4 z-10" />

        <div className="h-full flex items-center justify-center px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="w-full max-w-[560px]"
          >
            <div className="ui-card ui-card-hover px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 rounded-ui-md border border-border bg-gradient-to-br from-primary/25 via-primary/15 to-transparent shadow-ui-card flex items-center justify-center">
                  <div className="absolute inset-0 rounded-ui-md bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.22),transparent_70%)]" />
                  <Sparkles className="relative w-5 h-5 text-primary" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    {t.welcome.title}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.welcome.subtitle}
                  </p>
                </div>
              </div>

              <div className="ui-divider my-5" />

              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onOpenVault}
                  className="w-full justify-center"
                >
                  <FolderOpen className="w-5 h-5" />
                  {t.welcome.openFolder}
                </Button>

                <p className="text-sm text-muted-foreground text-center">
                  {t.welcome.selectFolder}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

