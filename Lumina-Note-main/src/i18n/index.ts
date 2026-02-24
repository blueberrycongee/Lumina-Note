import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import en from './locales/en';
import ja from './locales/ja';

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja';

export interface LocaleInfo {
  code: Locale;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
];

const locales: Record<Locale, typeof zhCN> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en': en,
  'ja': ja,
};

export function getTranslations(locale: Locale) {
  return locales[locale] || locales['zh-CN'];
}

export function detectSystemLocale(): Locale {
  const lang = navigator.language;
  if (lang.startsWith('zh')) {
    return lang.includes('TW') || lang.includes('HK') ? 'zh-TW' : 'zh-CN';
  }
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('en')) return 'en';
  return 'zh-CN'; // 默认简体中文
}

export type Translations = typeof zhCN;
