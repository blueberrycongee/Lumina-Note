import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Locale, getTranslations, detectSystemLocale, Translations } from '@/i18n';
import { useCommandStore, getDefaultCommandsFromTranslations, type SlashCommand } from './useCommandStore';

interface LocaleState {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

/**
 * 非 React 环境下获取当前翻译
 * 用于 Agent prompts、LLM services 等非组件代码
 */
export function getCurrentTranslations(): Translations {
  return useLocaleStore.getState().t;
}

/**
 * 非 React 环境下获取当前语言
 */
export function getCurrentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

// 获取保存的语言或检测系统语言
function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('lumina-locale');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.state?.locale) {
        return parsed.state.locale as Locale;
      }
    }
  } catch {}
  return detectSystemLocale();
}

const initialLocale = getInitialLocale();

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: initialLocale,
      t: getTranslations(initialLocale),
      setLocale: (locale: Locale) => {
        const newTranslations = getTranslations(locale);
        set({
          locale,
          t: newTranslations,
        });

        // 语言切换时更新命令的翻译
        const commandStore = useCommandStore.getState();
        const defaultCommands: SlashCommand[] = getDefaultCommandsFromTranslations(newTranslations);
        // 只更新未被用户修改的默认命令翻译
        const updatedCommands = commandStore.commands.map((cmd) => {
          const defaultCmd = defaultCommands.find((dc: SlashCommand) => dc.id === cmd.id);
          if (!defaultCmd) {
            return cmd;
          }
          const isDefault = cmd.isDefault ?? cmd.id.startsWith("default-");
          const isCustomized = cmd.isCustomized ?? false;
          if (isDefault && !isCustomized) {
            return { ...cmd, ...defaultCmd, isDefault: true, isCustomized: false };
          }
          return { ...cmd, isDefault };
        });
        // 确保所有默认命令都存在
        defaultCommands.forEach((defaultCmd: SlashCommand) => {
          if (!updatedCommands.find((cmd) => cmd.id === defaultCmd.id)) {
            updatedCommands.push(defaultCmd);
          }
        });
        useCommandStore.setState({ commands: updatedCommands });
      },
    }),
    {
      name: 'lumina-locale',
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);
