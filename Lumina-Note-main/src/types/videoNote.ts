/**
 * 视频笔记类型定义
 */

import { getCurrentLocale, getCurrentTranslations } from '@/stores/useLocaleStore';

export interface VideoNoteEntry {
  id: string;
  timestamp: number;      // 秒
  content: string;        // 用户笔记内容
  screenshot?: string;    // 截图相对路径
  aiSummary?: string;     // AI 生成的总结
  createdAt: string;      // ISO 日期
}

export interface VideoNoteFile {
  version: 1;
  video: {
    url: string;          // 原始 B站链接
    bvid: string;         // BV 号
    title: string;        // 视频标题
    duration?: number;    // 视频时长（秒）
  };
  createdAt: string;
  updatedAt: string;
  notes: VideoNoteEntry[];
}

/**
 * 从 B站链接提取 BV 号
 */
export function extractBvid(url: string): string | null {
  // 支持多种 B站链接格式
  // https://www.bilibili.com/video/BV1xxx
  // https://b23.tv/BV1xxx
  // BV1xxx
  const match = url.match(/BV[a-zA-Z0-9]{10}/);
  return match ? match[0] : null;
}

/**
 * 生成 B站嵌入播放器 URL
 */
export function getEmbedUrl(bvid: string, startTime?: number): string {
  let url = `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&danmaku=0`;
  if (startTime) {
    url += `&t=${startTime}`;
  }
  return url;
}

/**
 * 生成 B站完整页面 URL（可登录、发弹幕）
 */
export function getFullPageUrl(bvid: string, startTime?: number): string {
  let url = `https://www.bilibili.com/video/${bvid}`;
  if (startTime && startTime > 0) {
    url += `?t=${Math.floor(startTime)}`;
  }
  return url;
}

/**
 * 弹幕数据结构
 */
export interface DanmakuItem {
  time: number;      // 时间戳（秒）
  content: string;   // 弹幕内容
  type: number;      // 弹幕类型
  color: number;     // 颜色
  timestamp: number; // 发送时间戳
}

/**
 * 获取视频 CID（通过 Rust 后端）
 */
export async function getVideoCid(bvid: string): Promise<number | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cid = await invoke<number | null>('get_bilibili_cid', { bvid });
    return cid;
  } catch (error) {
    console.error('[Danmaku] Failed to get cid:', error);
    return null;
  }
}

/**
 * 获取视频弹幕列表（通过 Rust 后端）
 */
export async function getDanmakuList(cid: number): Promise<DanmakuItem[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const danmakus = await invoke<Array<{time: number, content: string, timestamp: number}>>('get_bilibili_danmaku', { cid });
    
    return danmakus.map(d => ({
      time: d.time,
      content: d.content,
      type: 1,
      color: 0xffffff,
      timestamp: d.timestamp,
    }));
  } catch (error) {
    console.error('[Danmaku] Failed to get danmaku list:', error);
    return [];
  }
}

/**
 * 筛选笔记弹幕（带特定前缀）
 */
export function filterNoteDanmakus(
  danmakus: DanmakuItem[], 
  prefix: string = 'NOTE:'
): DanmakuItem[] {
  return danmakus.filter(d => d.content.startsWith(prefix));
}

/**
 * 获取视频笔记文件路径
 */
export function getVideoNoteFilePath(vaultPath: string, bvid: string): string {
  const prefix = getCurrentTranslations().videoNote.filePrefix;
  return `${vaultPath}/${prefix}-${bvid}.md`;
}

/**
 * 将笔记数据转换为 MD 格式（带 frontmatter）
 */
export function videoNoteToMarkdown(noteFile: VideoNoteFile): string {
  const t = getCurrentTranslations();
  const lines: string[] = [];
  
  // Frontmatter
  lines.push('---');
  lines.push(`video_bvid: ${noteFile.video.bvid}`);
  lines.push(`video_title: ${noteFile.video.title}`);
  lines.push(`video_url: ${noteFile.video.url}`);
  lines.push(`created_at: ${noteFile.createdAt}`);
  lines.push(`updated_at: ${noteFile.updatedAt}`);
  lines.push('---');
  lines.push('');
  
  // 标题
  lines.push(`# ${t.videoNote.exportTitle} - ${noteFile.video.title}`);
  lines.push('');
  lines.push(`> ${t.videoNote.exportSourceLabel}: [${noteFile.video.bvid}](${noteFile.video.url})`);
  lines.push('');
  
  // 笔记内容
  lines.push(`## ${t.videoNote.exportNoteLabel}`);
  lines.push('');
  
  if (noteFile.notes.length === 0) {
    lines.push(`_${t.videoNote.noNotes}_`);
  } else {
    for (const note of noteFile.notes) {
      lines.push(`- **[${formatTimestamp(note.timestamp)}]** ${note.content}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 从 MD 文件内容解析笔记数据
 */
export function parseVideoNoteMd(content: string): VideoNoteFile | null {
  try {
    // 解析 frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;
    
    const frontmatter = frontmatterMatch[1];
    const getValue = (key: string): string => {
      const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
      return match ? match[1].trim() : '';
    };
    
    const bvid = getValue('video_bvid');
    const title = getValue('video_title');
    const url = getValue('video_url');
    const createdAt = getValue('created_at');
    const updatedAt = getValue('updated_at');
    
    if (!bvid) return null;
    
    // 解析笔记内容
    const notes: VideoNoteEntry[] = [];
    const notePattern = /- \*\*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\*\* (.+)/g;
    let match;
    
    while ((match = notePattern.exec(content)) !== null) {
      const timestamp = parseTimestamp(match[1]);
      if (timestamp !== null) {
        notes.push({
          id: generateNoteId(),
          timestamp,
          content: match[2],
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    return {
      version: 1,
      video: {
        url: url || `https://www.bilibili.com/video/${bvid}`,
        bvid,
        title: title || `视频笔记-${bvid}`,
      },
      notes,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[VideoNote] Failed to parse MD:', error);
    return null;
  }
}

/**
 * 格式化时间戳为 MM:SS 或 HH:MM:SS
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 解析时间戳字符串为秒数
 * 支持多种格式：
 * - "5:32" -> 332秒
 * - "1:05:32" -> 3932秒
 * - "332" -> 332秒（纯数字视为秒数）
 * - "5分32秒" -> 332秒
 * - "5m32s" -> 332秒
 */
export function parseTimestamp(str: string): number | null {
  if (!str || !str.trim()) return null;
  
  str = str.trim();
  
  // 纯数字 -> 秒数
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  
  // mm:ss 或 hh:mm:ss 格式
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  
  // 中文格式：5分32秒, 1小时5分32秒
  const cnMatch = str.match(/(?:(\d+)小时)?(?:(\d+)分)?(?:(\d+)秒)?/);
  if (cnMatch && (cnMatch[1] || cnMatch[2] || cnMatch[3])) {
    const h = parseInt(cnMatch[1] || '0', 10);
    const m = parseInt(cnMatch[2] || '0', 10);
    const s = parseInt(cnMatch[3] || '0', 10);
    return h * 3600 + m * 60 + s;
  }
  
  // 英文格式：5m32s, 1h5m32s
  const enMatch = str.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (enMatch && (enMatch[1] || enMatch[2] || enMatch[3])) {
    const h = parseInt(enMatch[1] || '0', 10);
    const m = parseInt(enMatch[2] || '0', 10);
    const s = parseInt(enMatch[3] || '0', 10);
    return h * 3600 + m * 60 + s;
  }
  
  return null;
}

/**
 * 生成唯一 ID
 */
export function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建新的视频笔记文件
 */
export function createVideoNoteFile(url: string, title?: string): VideoNoteFile {
  const t = getCurrentTranslations();
  const resolvedTitle = title ?? t.videoNote.untitledVideo;
  const bvid = extractBvid(url);
  if (!bvid) {
    throw new Error(t.videoNote.invalidUrl);
  }
  
  const now = new Date().toISOString();
  return {
    version: 1,
    video: {
      url,
      bvid,
      title: resolvedTitle,
    },
    createdAt: now,
    updatedAt: now,
    notes: [],
  };
}

/**
 * 导出为 Markdown 格式
 */
export function exportToMarkdown(noteFile: VideoNoteFile): string {
  const t = getCurrentTranslations();
  const locale = getCurrentLocale();
  const { video, createdAt, notes } = noteFile;
  
  let md = `# ${t.videoNote.exportTitle}：${video.title}\n\n`;
  md += `> 🎬 ${t.videoNote.exportSourceLabel}: ${video.url}\n`;
  md += `> 📅 ${t.videoNote.exportCreatedAtLabel}: ${new Date(createdAt).toLocaleString(locale)}\n`;
  if (video.duration) {
    md += `> ⏱️ ${t.videoNote.exportDurationLabel}: ${formatTimestamp(video.duration)}\n`;
  }
  md += '\n---\n\n';
  
  // 按时间戳排序
  const sortedNotes = [...notes].sort((a, b) => a.timestamp - b.timestamp);
  
  for (const note of sortedNotes) {
    const time = formatTimestamp(note.timestamp);
    md += `## [${time}](https://www.bilibili.com/video/${video.bvid}?t=${note.timestamp})\n\n`;
    
    if (note.screenshot) {
      md += `![${t.videoNote.exportScreenshotLabel}](${note.screenshot})\n\n`;
    }
    
    if (note.content) {
      md += `**${t.videoNote.exportNoteLabel}：**\n${note.content}\n\n`;
    }
    
    if (note.aiSummary) {
      md += `**${t.videoNote.exportAiSummaryLabel}：**\n> ${note.aiSummary.replace(/\n/g, '\n> ')}\n\n`;
    }
    
    md += '---\n\n';
  }
  
  md += `*${t.videoNote.exportFooter}*\n`;
  
  return md;
}
