import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getTranslations, detectSystemLocale, type Translations } from "@/i18n";

export interface SlashCommand {
    id: string;
    key: string;
    description: string;
    prompt: string;
    isDefault?: boolean;
    isCustomized?: boolean;
}

interface CommandState {
    commands: SlashCommand[];
    deletedDefaultIds: string[];
    registerCommand: (cmd: Omit<SlashCommand, "id">) => void;
    updateCommand: (id: string, cmd: Partial<SlashCommand>) => void;
    deleteCommand: (id: string) => void;
    unregisterCommand: (key: string) => void; // Keep for backward compatibility if needed, or remove
}

// 根据翻译对象获取默认命令（避免循环依赖）
export const getDefaultCommandsFromTranslations = (t: Translations): SlashCommand[] => {
    return [
        {
            id: "default-explain",
            key: "explain",
            description: t.ai.slashCommands.explain,
            prompt: t.ai.slashCommands.explainPrompt,
            isDefault: true,
            isCustomized: false,
        },
        {
            id: "default-fix",
            key: "fix",
            description: t.ai.slashCommands.fix,
            prompt: t.ai.slashCommands.fixPrompt,
            isDefault: true,
            isCustomized: false,
        },
        {
            id: "default-translate",
            key: "translate",
            description: t.ai.slashCommands.translate,
            prompt: t.ai.slashCommands.translatePrompt,
            isDefault: true,
            isCustomized: false,
        },
    ];
};

// 兼容旧 API：延迟获取翻译
export const getDefaultCommands = (): SlashCommand[] => {
    // 延迟导入避免循环依赖
    const { useLocaleStore } = require("./useLocaleStore");
    const t = useLocaleStore.getState().t;
    return getDefaultCommandsFromTranslations(t);
};

// 获取初始语言的翻译（不依赖 useLocaleStore）
function getInitialTranslations(): Translations {
    try {
        const saved = localStorage.getItem('lumina-locale');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.state?.locale) {
                return getTranslations(parsed.state.locale);
            }
        }
    } catch { }
    return getTranslations(detectSystemLocale());
}

const isDefaultCommandId = (id: string) => id.startsWith("default-");

const normalizeKey = (key: string) => key.trim().replace(/^\//, "");

export const useCommandStore = create<CommandState>()(
    persist(
        (set) => ({
            commands: getDefaultCommandsFromTranslations(getInitialTranslations()),
            deletedDefaultIds: [],
            registerCommand: (cmd) =>
                set((state) => ({
                    commands: [
                        ...state.commands.filter((c) => c.key !== normalizeKey(cmd.key)),
                        {
                            ...cmd,
                            key: normalizeKey(cmd.key),
                            id: Date.now().toString(),
                            isDefault: false,
                        },
                    ],
                })),
            updateCommand: (id, newCmd) =>
                set((state) => {
                    const current = state.commands.find((c) => c.id === id);
                    if (!current) {
                        return state;
                    }

                    const isDefault = current.isDefault ?? isDefaultCommandId(current.id);
                    const nextKey = newCmd.key ? normalizeKey(newCmd.key) : current.key;
                    const nextCmd: SlashCommand = {
                        ...current,
                        ...newCmd,
                        key: nextKey,
                        isDefault,
                    };

                    if (isDefault) {
                        const changed =
                            (newCmd.key && nextKey !== current.key) ||
                            (newCmd.description && newCmd.description !== current.description) ||
                            (newCmd.prompt && newCmd.prompt !== current.prompt);
                        if (changed) {
                            nextCmd.isCustomized = true;
                        }
                    }

                    let commands = state.commands.map((c) => (c.id === id ? nextCmd : c));
                    commands = commands.filter((c) => c.id === id || c.key !== nextCmd.key);
                    return { commands };
                }),
            deleteCommand: (id) =>
                set((state) => {
                    const isDefault = isDefaultCommandId(id);
                    return {
                        commands: state.commands.filter((c) => c.id !== id),
                        deletedDefaultIds: isDefault
                            ? [...new Set([...state.deletedDefaultIds, id])]
                            : state.deletedDefaultIds
                    };
                }),
            unregisterCommand: (key) =>
                set((state) => ({
                    commands: state.commands.filter((c) => c.key !== key),
                })),
        }),
        {
            name: "lumina-commands",
            version: 2,
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<CommandState> | undefined;
                if (!persisted?.commands) {
                    return currentState;
                }

                const deletedDefaultIds = persisted.deletedDefaultIds || [];
                // 合并：保留自定义命令，默认命令只在未被用户修改时更新翻译
                const defaultCommands = getDefaultCommandsFromTranslations(getInitialTranslations());
                const persistedCommands = persisted.commands;

                const mergedDefaults = defaultCommands
                    .filter(d => !deletedDefaultIds.includes(d.id))
                    .map((defaultCmd) => {
                        const persistedCmd = persistedCommands.find((c) => c.id === defaultCmd.id);
                        if (!persistedCmd) {
                            return defaultCmd;
                        }
                        const persistedIsDefault =
                            persistedCmd.isDefault ?? isDefaultCommandId(persistedCmd.id);
                        const persistedCustomized = persistedCmd.isCustomized ?? false;
                        if (persistedIsDefault && persistedCustomized) {
                            return {
                                ...persistedCmd,
                                isDefault: true,
                                isCustomized: true,
                            };
                        }
                        return defaultCmd;
                    });

                const customCommands = persistedCommands.filter((c) => {
                    const persistedIsDefault = c.isDefault ?? isDefaultCommandId(c.id);
                    return !persistedIsDefault;
                });

                return {
                    ...currentState,
                    commands: [...mergedDefaults, ...customCommands],
                    deletedDefaultIds,
                };
            },
        }
    )
);
