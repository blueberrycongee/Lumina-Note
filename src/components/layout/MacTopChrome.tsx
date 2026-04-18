import { isTauri, platform } from "@/lib/host";
import { useEffect, useState, type ReactNode } from "react";

const isMacByNavigator = (): boolean =>
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function useMacTopChromeEnabled(): boolean {
  const tauriRuntime = isTauri();
  const [enabled, setEnabled] = useState(() => tauriRuntime && isMacByNavigator());

  useEffect(() => {
    let disposed = false;

    if (!tauriRuntime) {
      setEnabled(false);
      return;
    }

    const syncPlatform = async () => {
      try {
        const os = await platform();
        if (!disposed) setEnabled(os === "darwin");
      } catch (error) {
        console.warn("Failed to detect platform for MacTopChrome:", error);
        if (!disposed) setEnabled(isMacByNavigator());
      }
    };

    void syncPlatform();
    return () => {
      disposed = true;
    };
  }, [tauriRuntime]);

  return enabled;
}

interface MacTopChromeProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function MacTopChrome(_: MacTopChromeProps) {
  return null;
}
