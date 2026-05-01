import type { Locale } from "@/i18n";
import type { PluginInfo } from "@/types/plugins";

interface LocalizedPluginDisplay {
  name: string;
  description?: string;
}

const BUILTIN_PLUGIN_DISPLAY: Record<
  string,
  Partial<Record<Locale, LocalizedPluginDisplay>>
> = {
  "browser-launcher": {
    "zh-CN": {
      name: "浏览器启动器 / Browser Launcher",
      description: "添加一个打开或聚焦浏览器标签页的按钮。",
    },
    "zh-TW": {
      name: "瀏覽器啟動器 / Browser Launcher",
      description: "新增一個開啟或聚焦瀏覽器標籤頁的按鈕。",
    },
    ja: {
      name: "ブラウザ起動 / Browser Launcher",
      description:
        "ブラウザタブを開く、またはフォーカスするボタンを追加します。",
    },
  },
  "video-note-launcher": {
    "zh-CN": {
      name: "视频笔记启动器 / Video Note Launcher",
      description: "添加一个打开或聚焦视频笔记的按钮。",
    },
    "zh-TW": {
      name: "視訊筆記啟動器 / Video Note Launcher",
      description: "新增一個開啟或聚焦視訊筆記的按鈕。",
    },
    ja: {
      name: "動画ノート起動 / Video Note Launcher",
      description: "動画ノートを開く、またはフォーカスするボタンを追加します。",
    },
  },
  "theme-oceanic": {
    "zh-CN": {
      name: "海洋主题 / Theme Oceanic",
      description: "一套偏海洋色调的外观主题。",
    },
    "zh-TW": {
      name: "海洋主題 / Theme Oceanic",
      description: "一套偏海洋色調的外觀主題。",
    },
    ja: {
      name: "オーシャンテーマ / Theme Oceanic",
      description: "海を思わせる色調の外観テーマです。",
    },
  },
  "ui-overhaul-lab": {
    "zh-CN": {
      name: "界面实验室 / UI Overhaul Lab",
      description: "用于试验界面改造能力的实验插件。",
    },
    "zh-TW": {
      name: "介面實驗室 / UI Overhaul Lab",
      description: "用於試驗介面改造能力的實驗插件。",
    },
    ja: {
      name: "UI 実験室 / UI Overhaul Lab",
      description: "UI 改修機能を試すための実験プラグインです。",
    },
  },
  "pixel-noir": {
    "zh-CN": {
      name: "像素黑白 / Pixel Noir",
      description: "为 Lumina 提供高对比黑白像素风外观。",
    },
    "zh-TW": {
      name: "像素黑白 / Pixel Noir",
      description: "為 Lumina 提供高對比黑白像素風外觀。",
    },
    ja: {
      name: "ピクセルノワール / Pixel Noir",
      description: "Lumina に高コントラストの白黒ピクセル風外観を適用します。",
    },
  },
  "executive-monochrome": {
    "zh-CN": {
      name: "商务黑白 / Executive Monochrome",
      description: "注重可读性和信息密度一致性的极简商务黑白主题。",
    },
    "zh-TW": {
      name: "商務黑白 / Executive Monochrome",
      description: "注重可讀性和資訊密度一致性的極簡商務黑白主題。",
    },
    ja: {
      name: "エグゼクティブモノクロ / Executive Monochrome",
      description:
        "可読性と情報密度の一貫性を重視したミニマルなモノクロテーマです。",
    },
  },
};

export function getPluginDisplay(
  plugin: PluginInfo,
  locale: Locale,
): LocalizedPluginDisplay {
  const localized = BUILTIN_PLUGIN_DISPLAY[plugin.id]?.[locale];
  return {
    name: localized?.name ?? plugin.name,
    description: localized?.description ?? plugin.description,
  };
}
