import { create } from "zustand";

export interface PluginPanelDefinition {
  pluginId: string;
  panelId: string;
  title: string;
  html: string;
}

export interface PluginRibbonItem {
  pluginId: string;
  itemId: string;
  title: string;
  icon?: string;
  section: "top" | "bottom";
  order: number;
  run: () => void;
}

export interface PluginStatusBarItem {
  pluginId: string;
  itemId: string;
  text: string;
  align: "left" | "right";
  order: number;
  run?: () => void;
}

export interface PluginSettingSection {
  pluginId: string;
  sectionId: string;
  title: string;
  html: string;
}

export interface PluginContextMenuItem {
  pluginId: string;
  itemId: string;
  title: string;
  order: number;
  run: (payload: { x: number; y: number; targetTag: string }) => void;
}

export interface PluginPaletteGroup {
  pluginId: string;
  groupId: string;
  title: string;
}

export interface PluginShellSlot {
  pluginId: string;
  slotId: string;
  html: string;
  order: number;
}

interface PluginUiState {
  panels: PluginPanelDefinition[];
  ribbonItems: PluginRibbonItem[];
  statusBarItems: PluginStatusBarItem[];
  settingSections: PluginSettingSection[];
  contextMenuItems: PluginContextMenuItem[];
  paletteGroups: PluginPaletteGroup[];
  shellSlots: PluginShellSlot[];
  registerPanel: (panel: PluginPanelDefinition) => void;
  unregisterPanel: (pluginId: string, panelId: string) => void;
  clearPluginPanels: (pluginId: string) => void;
  registerRibbonItem: (item: PluginRibbonItem) => void;
  unregisterRibbonItem: (pluginId: string, itemId: string) => void;
  registerStatusBarItem: (item: PluginStatusBarItem) => void;
  unregisterStatusBarItem: (pluginId: string, itemId: string) => void;
  registerSettingSection: (section: PluginSettingSection) => void;
  unregisterSettingSection: (pluginId: string, sectionId: string) => void;
  registerContextMenuItem: (item: PluginContextMenuItem) => void;
  unregisterContextMenuItem: (pluginId: string, itemId: string) => void;
  registerPaletteGroup: (group: PluginPaletteGroup) => void;
  unregisterPaletteGroup: (pluginId: string, groupId: string) => void;
  registerShellSlot: (slot: PluginShellSlot) => void;
  unregisterShellSlot: (pluginId: string, slotId: string) => void;
  clearPluginUi: (pluginId: string) => void;
}

export const usePluginUiStore = create<PluginUiState>((set) => ({
  panels: [],
  ribbonItems: [],
  statusBarItems: [],
  settingSections: [],
  contextMenuItems: [],
  paletteGroups: [],
  shellSlots: [],
  registerPanel: (panel) =>
    set((state) => {
      const next = state.panels.filter(
        (item) => !(item.pluginId === panel.pluginId && item.panelId === panel.panelId),
      );
      next.push(panel);
      return { panels: next };
    }),
  unregisterPanel: (pluginId, panelId) =>
    set((state) => ({
      panels: state.panels.filter(
        (item) => !(item.pluginId === pluginId && item.panelId === panelId),
      ),
    })),
  clearPluginPanels: (pluginId) =>
    set((state) => ({
      panels: state.panels.filter((item) => item.pluginId !== pluginId),
    })),
  registerRibbonItem: (item) =>
    set((state) => ({
      ribbonItems: [
        ...state.ribbonItems.filter(
          (entry) => !(entry.pluginId === item.pluginId && entry.itemId === item.itemId),
        ),
        item,
      ],
    })),
  unregisterRibbonItem: (pluginId, itemId) =>
    set((state) => ({
      ribbonItems: state.ribbonItems.filter(
        (entry) => !(entry.pluginId === pluginId && entry.itemId === itemId),
      ),
    })),
  registerStatusBarItem: (item) =>
    set((state) => ({
      statusBarItems: [
        ...state.statusBarItems.filter(
          (entry) => !(entry.pluginId === item.pluginId && entry.itemId === item.itemId),
        ),
        item,
      ],
    })),
  unregisterStatusBarItem: (pluginId, itemId) =>
    set((state) => ({
      statusBarItems: state.statusBarItems.filter(
        (entry) => !(entry.pluginId === pluginId && entry.itemId === itemId),
      ),
    })),
  registerSettingSection: (section) =>
    set((state) => ({
      settingSections: [
        ...state.settingSections.filter(
          (entry) =>
            !(entry.pluginId === section.pluginId && entry.sectionId === section.sectionId),
        ),
        section,
      ],
    })),
  unregisterSettingSection: (pluginId, sectionId) =>
    set((state) => ({
      settingSections: state.settingSections.filter(
        (entry) => !(entry.pluginId === pluginId && entry.sectionId === sectionId),
      ),
    })),
  registerContextMenuItem: (item) =>
    set((state) => ({
      contextMenuItems: [
        ...state.contextMenuItems.filter(
          (entry) => !(entry.pluginId === item.pluginId && entry.itemId === item.itemId),
        ),
        item,
      ],
    })),
  unregisterContextMenuItem: (pluginId, itemId) =>
    set((state) => ({
      contextMenuItems: state.contextMenuItems.filter(
        (entry) => !(entry.pluginId === pluginId && entry.itemId === itemId),
      ),
    })),
  registerPaletteGroup: (group) =>
    set((state) => ({
      paletteGroups: [
        ...state.paletteGroups.filter(
          (entry) => !(entry.pluginId === group.pluginId && entry.groupId === group.groupId),
        ),
        group,
      ],
    })),
  unregisterPaletteGroup: (pluginId, groupId) =>
    set((state) => ({
      paletteGroups: state.paletteGroups.filter(
        (entry) => !(entry.pluginId === pluginId && entry.groupId === groupId),
      ),
    })),
  registerShellSlot: (slot) =>
    set((state) => ({
      shellSlots: [
        ...state.shellSlots.filter(
          (entry) => !(entry.pluginId === slot.pluginId && entry.slotId === slot.slotId),
        ),
        slot,
      ],
    })),
  unregisterShellSlot: (pluginId, slotId) =>
    set((state) => ({
      shellSlots: state.shellSlots.filter(
        (entry) => !(entry.pluginId === pluginId && entry.slotId === slotId),
      ),
    })),
  clearPluginUi: (pluginId) =>
    set((state) => ({
      panels: state.panels.filter((item) => item.pluginId !== pluginId),
      ribbonItems: state.ribbonItems.filter((item) => item.pluginId !== pluginId),
      statusBarItems: state.statusBarItems.filter((item) => item.pluginId !== pluginId),
      settingSections: state.settingSections.filter((item) => item.pluginId !== pluginId),
      contextMenuItems: state.contextMenuItems.filter((item) => item.pluginId !== pluginId),
      paletteGroups: state.paletteGroups.filter((item) => item.pluginId !== pluginId),
      shellSlots: state.shellSlots.filter((item) => item.pluginId !== pluginId),
    })),
}));
