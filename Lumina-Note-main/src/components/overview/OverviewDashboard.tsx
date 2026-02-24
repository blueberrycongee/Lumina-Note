import { motion } from "framer-motion";
import { Keyboard, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { useLocaleStore } from "@/stores/useLocaleStore";

export function OverviewDashboard() {
  const { t } = useLocaleStore();

  return (
    <div className="flex-1 ui-app-bg overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 min-h-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          className="space-y-4 w-full"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Card className="md:col-span-7 shadow-none">
              <CardHeader className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <CardTitle>{t.overview.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="space-y-2">
                  <p className="text-[15px] font-medium text-foreground">
                    {t.overview.getStarted}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.overview.createHintPrefix} <Kbd>Ctrl</Kbd>
                    <span className="px-1 opacity-70">+</span>
                    <Kbd>N</Kbd> {t.overview.createHintSuffix}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 shadow-none">
              <CardHeader className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-primary" />
                <CardTitle>{t.overview.shortcutsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.commandPalette}</span>
                    <Kbd>Ctrl+P</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.quickOpen}</span>
                    <Kbd>Ctrl+O</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.globalSearch}</span>
                    <Kbd>Ctrl+Shift+F</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.save}</span>
                    <Kbd>Ctrl+S</Kbd>
                  </div>
                </div>
              </CardContent>
            </Card>

                      </div>
        </motion.div>
      </div>
    </div>
  );
}
