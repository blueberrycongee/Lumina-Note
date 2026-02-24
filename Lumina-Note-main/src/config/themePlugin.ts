/**
 * 外观插件接口
 * 支持从用户 Vault 目录加载自定义主题
 * 
 * 主题文件格式：
 * - 位置：{vault}/.lumina/themes/{theme-id}.json
 * - 结构：符合 Theme 接口的 JSON 文件
 */

import { Theme, ThemeColors, applyTheme, OFFICIAL_THEMES } from './themes';
import { getCurrentTranslations } from '@/stores/useLocaleStore';
import { invoke } from '@tauri-apps/api/core';

// 用户主题存储目录（相对于 vault）
const USER_THEMES_DIR = '.lumina/themes';

// 已加载的用户主题缓存
let userThemes: Theme[] = [];

/**
 * 验证主题颜色对象是否完整
 */
function validateThemeColors(colors: unknown): colors is ThemeColors {
  if (!colors || typeof colors !== 'object') return false;
  
  const requiredKeys: (keyof ThemeColors)[] = [
    'background', 'foreground', 'muted', 'mutedForeground',
    'accent', 'accentForeground', 'primary', 'primaryForeground', 'border',
    'heading', 'link', 'linkHover', 'code', 'codeBg',
    'codeBlock', 'codeBlockBg', 'blockquote', 'blockquoteBorder',
    'hr', 'tableBorder', 'tableHeaderBg', 'bold', 'italic',
    'listMarker', 'highlight', 'tag',
    'diffAddBg', 'diffAddText', 'diffRemoveBg', 'diffRemoveText'
  ];
  
  const obj = colors as Record<string, unknown>;
  return requiredKeys.every(key => typeof obj[key] === 'string');
}

/**
 * 验证主题对象是否有效
 */
function validateTheme(theme: unknown): theme is Theme {
  if (!theme || typeof theme !== 'object') return false;
  
  const t = theme as Record<string, unknown>;
  
  if (typeof t.id !== 'string' || !t.id) return false;
  if (typeof t.name !== 'string' || !t.name) return false;
  if (typeof t.description !== 'string') return false;
  
  if (!validateThemeColors(t.light)) return false;
  if (!validateThemeColors(t.dark)) return false;
  
  return true;
}

/**
 * 从 Vault 加载用户自定义主题
 */
export async function loadUserThemes(vaultPath: string): Promise<Theme[]> {
  try {
    const themesDir = `${vaultPath}/${USER_THEMES_DIR}`;
    
    // 检查目录是否存在
    const dirExists = await invoke<boolean>('path_exists', { path: themesDir });
    if (!dirExists) {
      console.log('[ThemePlugin] 用户主题目录不存在，跳过加载');
      userThemes = [];
      return [];
    }
    
    // 读取目录中的所有 JSON 文件
    const files = await invoke<string[]>('list_files', { 
      path: themesDir, 
      extension: '.json' 
    });
    
    const loadedThemes: Theme[] = [];
    
    for (const file of files) {
      try {
        const content = await invoke<string>('read_text_file', { 
          path: `${themesDir}/${file}` 
        });
        const themeData = JSON.parse(content);
        
        if (validateTheme(themeData)) {
          // 添加 user- 前缀避免与官方主题冲突
          if (!themeData.id.startsWith('user-')) {
            themeData.id = `user-${themeData.id}`;
          }
          loadedThemes.push(themeData);
          console.log(`[ThemePlugin] 加载用户主题: ${themeData.name}`);
        } else {
          console.warn(`[ThemePlugin] 主题文件格式无效: ${file}`);
        }
      } catch (err) {
        console.error(`[ThemePlugin] 加载主题失败: ${file}`, err);
      }
    }
    
    userThemes = loadedThemes;
    return loadedThemes;
  } catch (err) {
    console.error('[ThemePlugin] 加载用户主题失败:', err);
    userThemes = [];
    return [];
  }
}

/**
 * 获取所有可用主题（官方 + 用户）
 */
export function getAllThemes(): Theme[] {
  return [...OFFICIAL_THEMES, ...userThemes];
}

/**
 * 根据 ID 获取主题（支持用户主题）
 */
export function getThemeById(id: string): Theme | undefined {
  return getAllThemes().find(t => t.id === id);
}

/**
 * 获取用户主题列表
 */
export function getUserThemes(): Theme[] {
  return userThemes;
}

/**
 * 保存用户主题到 Vault
 */
export async function saveUserTheme(vaultPath: string, theme: Theme): Promise<boolean> {
  try {
    const themesDir = `${vaultPath}/${USER_THEMES_DIR}`;
    
    // 确保目录存在
    await invoke('ensure_dir', { path: themesDir });
    
    // 确保 ID 有 user- 前缀
    const themeToSave = {
      ...theme,
      id: theme.id.startsWith('user-') ? theme.id : `user-${theme.id}`
    };
    
    const fileName = `${themeToSave.id.replace('user-', '')}.json`;
    const filePath = `${themesDir}/${fileName}`;
    
    await invoke('write_text_file', {
      path: filePath,
      content: JSON.stringify(themeToSave, null, 2)
    });
    
    // 更新缓存
    const existingIndex = userThemes.findIndex(t => t.id === themeToSave.id);
    if (existingIndex >= 0) {
      userThemes[existingIndex] = themeToSave;
    } else {
      userThemes.push(themeToSave);
    }
    
    console.log(`[ThemePlugin] 保存用户主题: ${themeToSave.name}`);
    return true;
  } catch (err) {
    console.error('[ThemePlugin] 保存主题失败:', err);
    return false;
  }
}

/**
 * 删除用户主题
 */
export async function deleteUserTheme(vaultPath: string, themeId: string): Promise<boolean> {
  try {
    const themesDir = `${vaultPath}/${USER_THEMES_DIR}`;
    const fileName = `${themeId.replace('user-', '')}.json`;
    const filePath = `${themesDir}/${fileName}`;
    
    await invoke('delete_file', { path: filePath });
    
    // 更新缓存
    userThemes = userThemes.filter(t => t.id !== themeId);
    
    console.log(`[ThemePlugin] 删除用户主题: ${themeId}`);
    return true;
  } catch (err) {
    console.error('[ThemePlugin] 删除主题失败:', err);
    return false;
  }
}

/**
 * 导出主题为 JSON 字符串（用于分享）
 */
export function exportTheme(theme: Theme): string {
  const exportData = {
    ...theme,
    id: theme.id.replace('user-', ''), // 移除前缀便于分享
    _exportedFrom: 'Lumina Note',
    _exportedAt: new Date().toISOString()
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 从 JSON 字符串导入主题
 */
export function importTheme(jsonString: string): Theme | null {
  try {
    const data = JSON.parse(jsonString);
    
    // 移除导出元数据
    delete data._exportedFrom;
    delete data._exportedAt;
    
    if (validateTheme(data)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 创建主题模板（用于用户创建新主题）
 */
export function createThemeTemplate(basedOn?: Theme): Theme {
  const base = basedOn || OFFICIAL_THEMES[0];
  const t = getCurrentTranslations();
  
  return {
    id: `custom-${Date.now()}`,
    name: t.themeEditor.defaultThemeName,
    description: t.themeEditor.defaultThemeDescription,
    light: { ...base.light },
    dark: { ...base.dark }
  };
}

// 重新导出 applyTheme 以便统一使用
export { applyTheme };
