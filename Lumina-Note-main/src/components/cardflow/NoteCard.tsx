import "@/pdfWorker";
import React, { useMemo, useState, useEffect } from 'react';
import { FileEntry, readBinaryFileBase64 } from '@/lib/tauri';
import { Folder, Hash, FileText, Loader2 } from 'lucide-react';
import { getFileName } from '@/lib/utils';
import { pdfjs } from 'react-pdf';
import { useLocaleStore } from '@/stores/useLocaleStore';

// PDF 缩略图缓存（存储渲染后的图片 base64，而不是完整 PDF 数据）
const pdfThumbnailCache = new Map<string, string>();

interface NoteCardProps {
  entry: FileEntry;
  content: string;
  fileType: 'md' | 'pdf';
  onClick: () => void;
}

// 简单 hash 函数，用于生成伪随机变化
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 卡片尺寸类型
type CardSize = 'compact' | 'normal' | 'tall' | 'featured';

// 生成 PDF 缩略图（使用 pdfjs 直接渲染到 canvas）
async function generatePdfThumbnail(pdfPath: string): Promise<string> {
  // 检查缓存
  if (pdfThumbnailCache.has(pdfPath)) {
    return pdfThumbnailCache.get(pdfPath)!;
  }
  
  // 读取 PDF 文件
  const base64 = await readBinaryFileBase64(pdfPath);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  // 使用 pdfjs 加载 PDF
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  
  // 计算缩略图尺寸（宽度 300px）
  const viewport = page.getViewport({ scale: 1 });
  const scale = 300 / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  
  // 创建 canvas 并渲染
  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const context = canvas.getContext('2d')!;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
    canvas,
  } as any).promise;
  
  // 转换为图片 base64
  const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
  
  // 缓存并返回
  pdfThumbnailCache.set(pdfPath, thumbnail);
  
  // 清理
  pdf.destroy();
  
  return thumbnail;
}

// PDF 卡片组件
function PDFCard({ entry, onClick }: { entry: FileEntry; onClick: () => void }) {
  const { t } = useLocaleStore();
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const title = getFileName(entry.name).replace('.pdf', '');
  const pathParts = entry.path.replace(/\\/g, '/').split('/');
  const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : t.file.rootFolder;

  useEffect(() => {
    let mounted = true;
    
    generatePdfThumbnail(entry.path)
      .then(thumb => {
        if (mounted) {
          setThumbnail(thumb);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to generate PDF thumbnail:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      });
    
    return () => { mounted = false; };
  }, [entry.path]);

  return (
    <div 
      onClick={onClick}
      className="group w-full rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col"
    >
      {/* PDF 第一页预览 */}
      <div className="w-full bg-white relative overflow-hidden">
        {loading ? (
          <div className="aspect-[3/4] flex items-center justify-center bg-muted">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : error || !thumbnail ? (
          <div className="aspect-[3/4] flex flex-col items-center justify-center bg-muted">
            <FileText className="text-muted-foreground" size={40} />
            <span className="text-xs text-muted-foreground mt-2">{t.cardFlow.previewUnavailable}</span>
          </div>
        ) : (
          <img 
            src={thumbnail} 
            alt={title}
            className="w-full h-auto"
            loading="lazy"
          />
        )}
        {/* PDF 标签 */}
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-medium rounded shadow">
          PDF
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2">
        <h3 className="font-semibold leading-tight group-hover:text-primary transition-colors text-base line-clamp-2">
          {title}
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Folder size={12} />
          <span>{folder}</span>
        </div>
      </div>
    </div>
  );
}

export const NoteCard = React.memo(function NoteCard({ entry, content, fileType, onClick }: NoteCardProps) {
  // PDF 文件使用专门的 PDF 卡片组件
  if (fileType === 'pdf') {
    return <PDFCard entry={entry} onClick={onClick} />;
  }

  const { title, summary, image, tags, folder, cardSize, summaryLines, imageRatio } = useMemo(() => {
    const lines = content.split('\n');
    let title = getFileName(entry.name).replace('.md', '');
    let summary = '';
    let image = '';
    let tags: string[] = [];
    
    // 尝试从 frontmatter 获取 title 和 tags
    let bodyStartIndex = 0;

    // 简单的 frontmatter 解析
    if (lines[0]?.trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '---') {
          bodyStartIndex = i + 1;
          break;
        }
        if (line.startsWith('title:')) {
          title = line.replace('title:', '').trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('cover:')) {
          // 支持 frontmatter 中的封面图
          image = line.replace('cover:', '').trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('tags:')) {
            // 简单处理 [tag1, tag2]
            const tagsStr = line.replace('tags:', '').trim();
            if (tagsStr.startsWith('[') && tagsStr.endsWith(']')) {
                tags = tagsStr.slice(1, -1).split(',').map(t => t.trim());
            } 
        }
      }
    }

    // 提取正文和图片
    let bodyContent = lines.slice(bodyStartIndex).join('\n');
    
    // 如果 frontmatter 没有指定 cover，则从正文提取第一张图片
    if (!image) {
      // 1. 标准 Markdown 格式: ![alt](path)
      const imgMatch = bodyContent.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch) {
        image = imgMatch[1];
      } else {
        // 2. Obsidian wiki 链接格式: ![[image.png]]
        const wikiImgMatch = bodyContent.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|bmp|svg))\]\]/i);
        if (wikiImgMatch) {
          image = wikiImgMatch[1];
        } else {
          // 3. HTML 图片标签: <img src="...">
          const htmlImgMatch = bodyContent.match(/<img[^>]+src="([^">]+)"/);
          if (htmlImgMatch) {
            image = htmlImgMatch[1];
          }
        }
      }
    }

    // 只保留网络图片（本地图片暂不支持）
    if (image && !image.startsWith('http://') && !image.startsWith('https://') && !image.startsWith('data:')) {
      image = ''; // 清空本地图片路径
    }

    // 提取摘要（去除 Markdown 符号）
    const plainText = bodyContent
      .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片
      .replace(/\[.*?\]\(.*?\)/g, '$1') // 去除链接
      .replace(/#{1,6}\s/g, '') // 去除标题
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // 去除加粗
      .replace(/(\*|_)(.*?)\1/g, '$2') // 去除斜体
      .replace(/`{3}[\s\S]*?`{3}/g, '') // 去除代码块
      .replace(/`(.+?)`/g, '$1') // 去除行内代码
      .replace(/>\s/g, '') // 去除引用
      .replace(/<[^>]*>/g, '') // 去除HTML标签
      .replace(/\s+/g, ' ')
      .trim();

    // 获取文件夹名
    const pathParts = entry.path.replace(/\\/g, '/').split('/');
    const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';

    // 基于路径的伪随机数（保证同一卡片始终一致）
    const hash = hashCode(entry.path);
    const variation = hash % 10;

    // 根据内容特征和随机变化决定卡片尺寸
    let cardSize: CardSize = 'normal';
    let summaryLines = 3;
    let imageRatio = 'aspect-video'; // 16:9
    
    const contentLength = plainText.length;
    const hasImage = !!image;

    if (hasImage && contentLength > 300 && variation < 2) {
      // 10% 几率成为特色卡片（有图+长内容）
      cardSize = 'featured';
      summaryLines = 6;
      imageRatio = 'aspect-[4/3]'; // 更高的图片
    } else if (hasImage && variation < 4) {
      // 20% 几率高卡片
      cardSize = 'tall';
      summaryLines = 5;
      imageRatio = 'aspect-square'; // 1:1
    } else if (!hasImage && contentLength < 100 && variation < 6) {
      // 紧凑卡片（无图+短内容）
      cardSize = 'compact';
      summaryLines = 2;
    } else if (hasImage && variation >= 7) {
      // 宽图片
      imageRatio = 'aspect-[21/9]';
      summaryLines = 2;
    } else {
      // 正常卡片，但也有些变化
      summaryLines = 2 + (hash % 3); // 2-4 行
    }

    // 根据摘要行数截取内容
    const maxChars = summaryLines * 40;
    summary = plainText.slice(0, maxChars);

    return { title, summary, image, tags, folder, cardSize, summaryLines, imageRatio };
  }, [entry, content]);

  // 根据卡片类型应用不同样式
  const cardClasses = {
    compact: 'bg-card',
    normal: 'bg-card',
    tall: 'bg-card',
    featured: 'bg-gradient-to-br from-primary/5 to-transparent border-primary/20',
  };

  const lineClampClass = {
    2: 'line-clamp-2',
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
    6: 'line-clamp-6',
  }[summaryLines] || 'line-clamp-3';

  return (
    <div 
      onClick={onClick}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 250px' }}
      className={`group w-full rounded-xl border border-border text-card-foreground shadow-sm hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col ${cardClasses[cardSize]}`}
    >
      {/* 封面图 */}
      {image && (
        <div className={`w-full ${imageRatio} overflow-hidden bg-muted relative`}>
           <img 
             src={image} 
             alt={title} 
             className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
             onError={(e) => {
                 e.currentTarget.parentElement!.style.display = 'none';
             }} 
           />
        </div>
      )}

      <div className={`p-4 flex flex-col gap-2 ${cardSize === 'featured' ? 'p-5' : ''}`}>
        {/* 标题 */}
        <h3 className={`font-semibold leading-tight group-hover:text-primary transition-colors ${cardSize === 'featured' ? 'text-xl' : 'text-base'}`}>
          {title}
        </h3>

        {/* 文件夹 */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Folder size={12} />
          <span>{folder}</span>
        </div>

        {/* 摘要 */}
        {summary && (
          <p className={`text-sm text-muted-foreground ${lineClampClass} leading-relaxed`}>
            {summary}
          </p>
        )}

        {/* 底部信息：标签 */}
        {tags.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
            {tags.slice(0, cardSize === 'featured' ? 5 : 3).map(tag => (
                <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary">
                <Hash size={10} className="mr-0.5" />
                {tag}
                </span>
            ))}
            {tags.length > (cardSize === 'featured' ? 5 : 3) && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - (cardSize === 'featured' ? 5 : 3)}</span>
            )}
            </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.entry.path === next.entry.path && prev.content === next.content && prev.fileType === next.fileType);
