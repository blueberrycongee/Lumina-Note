import { useEffect } from "react";
import { Plus, Settings as SettingsIcon, PanelLeft, PanelRight } from "lucide-react";
import { useCommandMenu, type CommandItem } from "@/stores/useCommandMenu";
import { useUIStore } from "@/stores/useUIStore";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";

/**
 * CommandMenuProvider — installs the global Cmd/Ctrl+K shortcut and
 * registers the baseline set of app-level commands (new chat, open
 * settings, toggle sidebars). Other feature hooks register their own
 * commands via useCommandMenu.registerSource.
 *
 * Mount once at the App root, above any route switch.
 */
export function CommandMenuProvider() {
  const { toggle, registerSource, unregisterSource } = useCommandMenu();
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);
  const setSkillManagerOpen = useUIStore((s) => s.setSkillManagerOpen);
  const newSession = useOpencodeAgent((s) => s.newSession);

  // Cmd/Ctrl+K — open/close the palette.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key !== "k" && e.key !== "K") return;
      // Don't intercept Cmd+K inside a text input that already handles it
      // (e.g. Markdown link insertion in the editor).
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".cm-editor, .ProseMirror")) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [toggle]);

  // Register the baseline commands.
  useEffect(() => {
    const items: CommandItem[] = [
      {
        id: "action.new-chat",
        group: "actions",
        title: "New chat",
        description: "Start a fresh agent conversation",
        icon: <Plus size={16} />,
        shortcut: "⌘N",
        keywords: ["new", "chat", "conversation", "session"],
        run: () => {
          void newSession();
        },
      },
      {
        id: "nav.open-skill-manager",
        group: "navigation",
        title: "Open skill manager",
        description: "Manage registered skills",
        icon: <SettingsIcon size={16} />,
        keywords: ["skill", "manager"],
        run: () => setSkillManagerOpen(true),
      },
      {
        id: "nav.toggle-left-sidebar",
        group: "navigation",
        title: "Toggle left sidebar",
        icon: <PanelLeft size={16} />,
        shortcut: "⌘B",
        keywords: ["sidebar", "left", "navigation", "explorer"],
        run: () => toggleLeftSidebar(),
      },
      {
        id: "nav.toggle-right-sidebar",
        group: "navigation",
        title: "Toggle right sidebar",
        icon: <PanelRight size={16} />,
        keywords: ["sidebar", "right", "outline"],
        run: () => toggleRightSidebar(),
      },
    ];
    registerSource("app.baseline", items);
    return () => unregisterSource("app.baseline");
  }, [
    newSession,
    registerSource,
    setSkillManagerOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
    unregisterSource,
  ]);

  return null;
}
