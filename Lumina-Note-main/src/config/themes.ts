/**
 * 官方主题定义
 * 每套主题包含 light 和 dark 两个版本
 */

export interface ThemeColors {
  // 基础 UI 颜色
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  
  // Markdown 渲染颜色
  heading: string;          // 标题颜色
  link: string;             // 链接颜色
  linkHover: string;        // 链接悬浮颜色
  code: string;             // 行内代码文字
  codeBg: string;           // 行内代码背景
  codeBlock: string;        // 代码块文字
  codeBlockBg: string;      // 代码块背景
  blockquote: string;       // 引用文字
  blockquoteBorder: string; // 引用边框
  hr: string;               // 分割线
  tableBorder: string;      // 表格边框
  tableHeaderBg: string;    // 表格头背景
  bold: string;             // 粗体
  italic: string;           // 斜体
  listMarker: string;       // 列表标记
  highlight: string;        // 高亮背景
  tag: string;              // 标签颜色

  // Diff (代码对比) 颜色
  diffAddBg: string;        // 新增代码背景
  diffAddText: string;      // 新增代码文字
  diffRemoveBg: string;     // 删除代码背景
  diffRemoveText: string;   // 删除代码文字
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  light: ThemeColors;
  dark: ThemeColors;
}

// 辅助函数：用于快速生成“单色调统一”的基础主题
function createThemeColors(
  hue: number,
  satLight: number,
  satDark: number,
  primaryHue: number,
  primarySat: number
): { light: ThemeColors; dark: ThemeColors } {
  return {
    light: {
      background: `${hue} ${satLight}% 98%`,
      foreground: `${hue} ${satLight + 5}% 10%`,
      muted: `${hue} ${satLight}% 94%`,
      mutedForeground: `${hue} ${satLight - 5}% 45%`,
      accent: `${hue} ${satLight}% 91%`,
      accentForeground: `${hue} ${satLight + 5}% 15%`,
      primary: `${primaryHue} ${primarySat}% 50%`,
      primaryForeground: `${hue} ${satLight}% 98%`,
      border: `${hue} ${satLight - 2}% 88%`,
      heading: `${primaryHue} ${primarySat + 10}% 35%`,
      link: `${primaryHue} ${primarySat + 15}% 45%`,
      linkHover: `${primaryHue} ${primarySat + 20}% 40%`,
      code: `${hue + 30} 50% 35%`,
      codeBg: `${hue} ${satLight}% 92%`,
      codeBlock: `${hue} ${satLight}% 20%`,
      codeBlockBg: `${hue} ${satLight}% 95%`,
      blockquote: `${hue} ${satLight - 5}% 40%`,
      blockquoteBorder: `${primaryHue} ${primarySat - 10}% 60%`,
      hr: `${hue} ${satLight - 5}% 80%`,
      tableBorder: `${hue} ${satLight - 2}% 85%`,
      tableHeaderBg: `${hue} ${satLight}% 95%`,
      bold: `${hue} ${satLight + 5}% 15%`,
      italic: `${hue} ${satLight}% 25%`,
      listMarker: `${primaryHue} ${primarySat - 5}% 50%`,
      highlight: `50 80% 85%`,
      tag: `${primaryHue + 30} ${primarySat}% 45%`,
      // 默认 Diff 颜色：柔和舒适
      diffAddBg: `160 40% 92%`,
      diffAddText: `160 50% 30%`,
      diffRemoveBg: `350 40% 94%`,
      diffRemoveText: `350 50% 35%`,
    },
    dark: {
      background: `${hue} ${satDark}% 11%`,
      foreground: `${hue} ${satDark + 3}% 85%`,
      muted: `${hue} ${satDark}% 15%`,
      mutedForeground: `${hue} ${satDark}% 55%`,
      accent: `${hue} ${satDark}% 18%`,
      accentForeground: `${hue} ${satDark + 3}% 92%`,
      primary: `${primaryHue} ${primarySat - 10}% 55%`,
      primaryForeground: `${hue} ${satDark}% 12%`,
      border: `${hue} ${satDark}% 22%`,
      heading: `${primaryHue} ${primarySat}% 70%`,
      link: `${primaryHue} ${primarySat + 5}% 65%`,
      linkHover: `${primaryHue} ${primarySat + 10}% 70%`,
      code: `${hue + 30} 40% 70%`,
      codeBg: `${hue} ${satDark + 2}% 18%`,
      codeBlock: `${hue} ${satDark}% 80%`,
      codeBlockBg: `${hue} ${satDark}% 14%`,
      blockquote: `${hue} ${satDark}% 65%`,
      blockquoteBorder: `${primaryHue} ${primarySat - 15}% 45%`,
      hr: `${hue} ${satDark}% 28%`,
      tableBorder: `${hue} ${satDark}% 25%`,
      tableHeaderBg: `${hue} ${satDark}% 16%`,
      bold: `${hue} ${satDark + 3}% 95%`,
      italic: `${hue} ${satDark}% 80%`,
      listMarker: `${primaryHue} ${primarySat - 10}% 60%`,
      highlight: `50 50% 25%`,
      tag: `${primaryHue + 30} ${primarySat - 5}% 60%`,
      // 默认 Diff 颜色：深色模式
      diffAddBg: `160 35% 20%`,
      diffAddText: `160 50% 70%`,
      diffRemoveBg: `350 35% 22%`,
      diffRemoveText: `350 50% 70%`,
    },
  };
}

// 官方主题列表 (共15款)
export const OFFICIAL_THEMES: Theme[] = [
  // =================================================================
  // 基础系列 (经典单色调，干净整洁) - 11款
  // =================================================================
  {
    id: "default",
    name: "Default",
    description: "Warm beige tones",
    ...createThemeColors(40, 10, 5, 215, 25),
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Fresh blue tones",
    ...createThemeColors(210, 15, 12, 210, 65),
  },
  {
    id: "forest",
    name: "Forest",
    description: "Natural green tones",
    ...createThemeColors(140, 10, 8, 150, 45),
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Elegant purple tones",
    ...createThemeColors(270, 12, 10, 270, 50),
  },
  {
    id: "rose",
    name: "Rose",
    description: "Soft pink tones",
    ...createThemeColors(350, 12, 8, 350, 55),
  },
  {
    id: "amber",
    name: "Sunset",
    description: "Vibrant orange-yellow tones",
    ...createThemeColors(35, 15, 10, 30, 80),
  },
  {
    id: "mint",
    name: "Mint",
    description: "Cool cyan tones",
    ...createThemeColors(170, 15, 10, 165, 55),
  },
  {
    id: "indigo",
    name: "Indigo",
    description: "Deep blue-purple tones",
    ...createThemeColors(235, 15, 12, 240, 60),
  },
  {
    id: "coffee",
    name: "Latte",
    description: "Vintage coffee tones",
    ...createThemeColors(30, 20, 12, 25, 45),
  },
  {
    id: "nord",
    name: "Aurora",
    description: "Cool gray-blue tones",
    ...createThemeColors(220, 10, 15, 195, 45),
  },
  {
    id: "mono",
    name: "Minimal",
    description: "Pure black and white",
    ...createThemeColors(0, 0, 0, 0, 0),
  },

  // =================================================================
  // 高级系列 (复杂多色组合，个性鲜明) - 4款
  // =================================================================
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon colors: purple-black + hot pink + cyan",
    light: {
       background: "280 20% 96%",
       foreground: "280 80% 10%",
       muted: "280 20% 90%",
       mutedForeground: "280 10% 40%",
       accent: "300 100% 90%",
       accentForeground: "300 100% 20%",
       primary: "320 100% 45%",
       primaryForeground: "0 0% 100%",
       border: "280 30% 80%",
       heading: "260 80% 40%",
       link: "190 100% 40%",
       linkHover: "320 100% 50%",
       code: "330 65% 45%",
       codeBg: "280 20% 92%",
       codeBlock: "260 60% 40%",
       codeBlockBg: "280 20% 95%",
       blockquote: "280 40% 40%",
       blockquoteBorder: "320 100% 50%",
       hr: "190 100% 40%",
       tableBorder: "280 20% 80%",
       tableHeaderBg: "300 30% 95%",
       bold: "260 80% 30%",
       italic: "35 80% 45%",
       listMarker: "190 100% 40%",
       highlight: "60 100% 80%",
       tag: "320 80% 45%",
       // 赛博朋克风 Diff：霓虹感
       diffAddBg: "190 50% 90%",
       diffAddText: "190 100% 30%",
       diffRemoveBg: "320 50% 95%",
       diffRemoveText: "320 100% 35%",
    },
    dark: {
       background: "265 50% 10%",
       foreground: "265 10% 90%",
       muted: "265 40% 20%",
       mutedForeground: "265 20% 60%",
       accent: "265 40% 25%",
       accentForeground: "320 100% 80%",
       primary: "320 100% 50%",
       primaryForeground: "0 0% 100%",
       border: "265 40% 30%",
       heading: "190 100% 50%",
       link: "320 100% 60%",
       linkHover: "60 100% 50%",
       code: "60 100% 65%",
       codeBg: "265 40% 20%",
       codeBlock: "190 80% 70%",
       codeBlockBg: "265 50% 13%",
       blockquote: "265 20% 70%",
       blockquoteBorder: "60 100% 50%",
       hr: "320 100% 40%",
       tableBorder: "265 40% 30%",
       tableHeaderBg: "265 40% 20%",
       bold: "320 100% 60%",
       italic: "190 100% 60%",
       listMarker: "60 100% 50%",
       highlight: "320 100% 30%",
       tag: "190 100% 40%",
       // 赛博朋克风 Diff：深色霓虹
       diffAddBg: "190 60% 15%",
       diffAddText: "190 100% 70%",
       diffRemoveBg: "320 60% 15%",
       diffRemoveText: "320 100% 70%",
    }
  },

  {
    id: "dracula",
    name: "Dracula",
    description: "Classic colors: cool gray + purple + green + orange mix",
    light: {
       background: "220 20% 97%",
       foreground: "230 15% 30%",
       muted: "220 15% 92%",
       mutedForeground: "230 10% 60%",
       accent: "220 20% 90%",
       accentForeground: "265 50% 40%",
       primary: "265 60% 50%",
       primaryForeground: "0 0% 98%",
       border: "220 15% 85%",
       // Markdown - 丰富的复古撞色
       heading: "230 25% 30%",
       link: "265 60% 50%",
       linkHover: "330 70% 50%",
       code: "330 65% 45%",
       codeBg: "220 20% 93%",
       codeBlock: "230 15% 35%",
       codeBlockBg: "220 15% 95%",
       blockquote: "230 10% 50%",
       blockquoteBorder: "135 50% 45%",
       hr: "220 15% 80%",
       tableBorder: "220 15% 80%",
       tableHeaderBg: "220 20% 88%",
       bold: "265 60% 45%",
       italic: "35 80% 45%",
       listMarker: "135 60% 40%",
       highlight: "60 80% 85%",
       tag: "265 50% 50%",
       // Dracula 浅色 Diff
       diffAddBg: "135 50% 92%",
       diffAddText: "135 70% 30%",
       diffRemoveBg: "330 50% 95%",
       diffRemoveText: "330 70% 35%",
    },
    dark: {
       background: "231 15% 18%",
       foreground: "60 30% 96%",
       muted: "231 15% 25%",
       mutedForeground: "231 10% 65%",
       accent: "231 15% 30%",
       accentForeground: "60 30% 96%",
       primary: "265 89% 68%",
       primaryForeground: "231 15% 18%",
       border: "231 15% 35%",
       // Markdown
       heading: "265 89% 78%",
       link: "191 97% 77%",
       linkHover: "135 94% 65%",
       code: "326 100% 74%",
       codeBg: "231 15% 25%",
       codeBlock: "60 30% 90%",
       codeBlockBg: "231 15% 15%",
       blockquote: "60 30% 80%",
       blockquoteBorder: "35 100% 65%",
       hr: "231 15% 40%",
       tableBorder: "231 15% 40%",
       tableHeaderBg: "231 15% 28%",
       bold: "135 94% 65%",
       italic: "60 100% 65%",
       listMarker: "191 97% 77%",
       highlight: "60 50% 40%",
       tag: "326 90% 70%",
       // Dracula 经典 Diff 配色
       diffAddBg: "135 50% 20%",
       diffAddText: "135 94% 75%",
       diffRemoveBg: "340 50% 25%",
       diffRemoveText: "340 94% 75%",
    }
  },

  {
    id: "solarized",
    name: "Solarized",
    description: "Eye-friendly: warm beige + blue/orange/red/green",
    light: {
       background: "44 87% 94%",
       foreground: "192 81% 14%",
       muted: "42 40% 85%",
       mutedForeground: "200 10% 50%",
       accent: "42 40% 88%",
       accentForeground: "192 81% 14%",
       primary: "168 60% 35%",
       primaryForeground: "44 87% 96%",
       border: "42 35% 85%",
       // Markdown - 丰富的复古撞色
       heading: "16 70% 45%",
       link: "205 70% 45%",
       linkHover: "16 80% 50%",
       code: "330 60% 45%",
       codeBg: "42 40% 90%",
       codeBlock: "192 80% 20%",
       codeBlockBg: "44 50% 96%",
       blockquote: "65 80% 30%",
       blockquoteBorder: "65 60% 40%",
       hr: "42 30% 80%",
       tableBorder: "42 35% 82%",
       tableHeaderBg: "42 40% 88%",
       bold: "16 70% 45%",
       italic: "205 70% 45%",
       listMarker: "168 60% 35%",
       highlight: "50 90% 85%",
       tag: "205 60% 50%",
       // Solarized Diff：橄榄绿和橙红
       diffAddBg: "65 50% 88%",
       diffAddText: "65 80% 30%",
       diffRemoveBg: "16 60% 92%",
       diffRemoveText: "16 80% 40%",
    },
    dark: {
       background: "192 81% 14%",
       foreground: "192 20% 65%",
       muted: "192 60% 18%",
       mutedForeground: "192 20% 50%",
       accent: "192 60% 20%",
       accentForeground: "192 20% 75%",
       primary: "205 70% 50%",
       primaryForeground: "0 0% 95%",
       border: "192 60% 20%",
       // Markdown
       heading: "35 80% 50%",
       link: "168 60% 50%",
       linkHover: "35 90% 60%",
       code: "65 80% 50%",
       codeBg: "192 60% 12%",
       codeBlock: "45 80% 60%",
       codeBlockBg: "192 60% 10%",
       blockquote: "205 50% 60%",
       blockquoteBorder: "205 60% 50%",
       hr: "192 60% 25%",
       tableBorder: "192 60% 22%",
       tableHeaderBg: "192 60% 18%",
       bold: "16 70% 55%",
       italic: "330 60% 60%",
       listMarker: "168 60% 50%",
       highlight: "192 50% 25%",
       tag: "330 60% 55%",
       // Solarized Dark Diff
       diffAddBg: "65 50% 20%",
       diffAddText: "65 60% 60%",
       diffRemoveBg: "16 50% 22%",
       diffRemoveText: "16 60% 60%",
    }
  },

  {
    id: "gruvbox",
    name: "Retro",
    description: "Nostalgic: earth tones + red/green/blue/yellow accents",
    light: {
       background: "45 25% 94%",  // 暖米色
       foreground: "20 15% 25%",  // 深褐色文字
       muted: "45 20% 88%",
       mutedForeground: "20 10% 55%",
       accent: "45 20% 85%",
       accentForeground: "20 15% 20%",
       primary: "0 70% 50%",      // 复古红作为主色
       primaryForeground: "45 25% 96%",
       border: "45 20% 82%",
       // Markdown - 丰富的复古撞色
       heading: "35 85% 45%",     // 复古橙标题
       link: "215 65% 45%",       // 复古蓝链接
       linkHover: "0 75% 55%",    // 悬停变红
       code: "270 50% 50%",       // 复古紫行内代码
       codeBg: "45 25% 90%",
       codeBlock: "142 70% 35%",  // 复古绿代码块文字
       codeBlockBg: "45 30% 88%", // 稍微深一点的米色背景
       blockquote: "20 15% 40%",  // 褐色引用
       blockquoteBorder: "35 85% 50%", // 橙色边框
       hr: "45 20% 75%",
       tableBorder: "45 20% 80%",
       tableHeaderBg: "45 25% 88%",
       bold: "0 75% 45%",         // 红色粗体
       italic: "215 65% 45%",     // 蓝色斜体
       listMarker: "35 85% 45%",  // 橙色列表点
       highlight: "50 90% 80%",   // 亮黄色高亮
       tag: "215 60% 50%",
       // Gruvbox 经典复古红绿
       diffAddBg: "142 50% 85%",
       diffAddText: "142 80% 25%",
       diffRemoveBg: "0 60% 90%",
       diffRemoveText: "0 80% 30%",
    },
    dark: {
       background: "20 15% 18%",  // 深炭褐色背景
       foreground: "45 25% 85%",  // 暖米色文字
       muted: "20 15% 25%",
       mutedForeground: "45 20% 60%",
       accent: "20 15% 28%",
       accentForeground: "45 25% 90%",
       primary: "35 85% 60%",     // 复古橙作为主色
       primaryForeground: "20 15% 15%",
       border: "20 15% 35%",
       // Markdown
       heading: "45 90% 65%",     // 复古黄标题
       link: "215 75% 65%",       // 复古亮蓝链接
       linkHover: "35 90% 70%",   // 悬停变橙
       code: "170 70% 65%",       // 复古青色代码
       codeBg: "20 15% 24%",
       codeBlock: "142 75% 60%",  // 复古绿代码块文字
       codeBlockBg: "20 15% 14%", // 更深的代码背景
       blockquote: "45 20% 70%",
       blockquoteBorder: "142 75% 55%", // 绿色边框
       hr: "20 15% 35%",
       tableBorder: "20 15% 35%",
       tableHeaderBg: "20 15% 25%",
       bold: "0 80% 65%",         // 亮红色粗体
       italic: "270 70% 70%",     // 亮紫色斜体
       listMarker: "45 90% 65%",  // 黄色列表点
       highlight: "35 80% 35%",
       tag: "270 60% 65%",
       // Gruvbox Dark Diff
       diffAddBg: "142 40% 20%",
       diffAddText: "142 70% 70%",
       diffRemoveBg: "0 40% 20%",
       diffRemoveText: "0 70% 70%",
    }
  },
];

// 应用主题到 DOM
export function applyTheme(theme: Theme, isDark: boolean) {
  const colors = isDark ? theme.dark : theme.light;
  const root = document.documentElement;
  
  // 基础 UI 颜色
  root.style.setProperty("--background", colors.background);
  root.style.setProperty("--foreground", colors.foreground);
  root.style.setProperty("--muted", colors.muted);
  root.style.setProperty("--muted-foreground", colors.mutedForeground);
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-foreground", colors.accentForeground);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-foreground", colors.primaryForeground);
  root.style.setProperty("--border", colors.border);
  
  // Markdown 渲染颜色
  root.style.setProperty("--md-heading", colors.heading);
  root.style.setProperty("--md-link", colors.link);
  root.style.setProperty("--md-link-hover", colors.linkHover);
  root.style.setProperty("--md-code", colors.code);
  root.style.setProperty("--md-code-bg", colors.codeBg);
  root.style.setProperty("--md-code-block", colors.codeBlock);
  root.style.setProperty("--md-code-block-bg", colors.codeBlockBg);
  root.style.setProperty("--md-blockquote", colors.blockquote);
  root.style.setProperty("--md-blockquote-border", colors.blockquoteBorder);
  root.style.setProperty("--md-hr", colors.hr);
  root.style.setProperty("--md-table-border", colors.tableBorder);
  root.style.setProperty("--md-table-header-bg", colors.tableHeaderBg);
  root.style.setProperty("--md-bold", colors.bold);
  root.style.setProperty("--md-italic", colors.italic);
  root.style.setProperty("--md-list-marker", colors.listMarker);
  root.style.setProperty("--md-highlight", colors.highlight);
  root.style.setProperty("--md-tag", colors.tag);

  // Diff 颜色
  root.style.setProperty("--diff-add-bg", colors.diffAddBg);
  root.style.setProperty("--diff-add-text", colors.diffAddText);
  root.style.setProperty("--diff-remove-bg", colors.diffRemoveBg);
  root.style.setProperty("--diff-remove-text", colors.diffRemoveText);
}

// 根据 ID 获取主题
export function getThemeById(id: string): Theme | undefined {
  return OFFICIAL_THEMES.find(t => t.id === id);
}
