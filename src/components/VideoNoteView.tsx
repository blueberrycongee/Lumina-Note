/**
 * 视频笔记视图组件
 * 支持边看 B站视频边做笔记
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Plus, 
  Download, 
  Clock, 
  Trash2, 
  ExternalLink,
  Video,
  X,
  Edit3,
  Check,
  Minus
} from 'lucide-react';
import {
  VideoNoteFile,
  VideoNoteEntry,
  extractBvid,
  getFullPageUrl,
  formatTimestamp,
  parseTimestamp,
  generateNoteId,
  createVideoNoteFile,
  exportToMarkdown,
  getVideoCid,
  getDanmakuList,
  filterNoteDanmakus,
  getVideoNoteFilePath,
  videoNoteToMarkdown,
  parseVideoNoteMd,
} from '@/types/videoNote';
import { readFile } from '@/lib/tauri';
import { useFileStore } from '@/stores/useFileStore';
import { saveFile } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';

interface VideoNoteViewProps {
  onClose?: () => void;
  onMinimize?: () => void;  // 最小化回调（隐藏界面但保持 WebView）
  initialUrl?: string;  // 从外部传入的初始 URL
  isActive?: boolean;   // 是否是当前激活的标签页
}

export function VideoNoteView({ onClose, onMinimize, initialUrl, isActive = true }: VideoNoteViewProps) {
  const { vaultPath } = useFileStore();
  
  // 使用传入的 initialUrl
  const effectiveUrl = initialUrl;
  
  // 视频状态
  const [videoUrl, setVideoUrl] = useState('');
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // 笔记数据
  const [noteFile, setNoteFile] = useState<VideoNoteFile | null>(null);
  
  // 编辑状态
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  
  const timeUpdateInterval = useRef<number | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  // 时间输入状态
  const [timeInput, setTimeInput] = useState('');
  const [isEditingTime, setIsEditingTime] = useState(false);
  
  // 弹幕同步状态
  const [danmakuPrefix, setDanmakuPrefix] = useState('NOTE:');
  const [isSyncingDanmaku, setIsSyncingDanmaku] = useState(false);
  
  // 内嵌 WebView 状态
  const [webviewCreated, setWebviewCreated] = useState(false);

  // 记录是否已自动加载
  const autoLoadedRef = useRef(false);

  // 创建内嵌 WebView
  const createWebview = useCallback(async () => {
    if (!noteFile || !videoContainerRef.current) return;
    
    const container = videoContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      await invoke('create_embedded_webview', {
        url: getFullPageUrl(noteFile.video.bvid),
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
      setWebviewCreated(true);
      console.log('[VideoNote] WebView 创建成功');
      
      // 延迟启用自动填充（等待 B站页面加载）
      setTimeout(async () => {
        try {
          await invoke('setup_danmaku_autofill', { prefix: danmakuPrefix });
          console.log('[VideoNote] 弹幕自动填充已启用');
        } catch (e) {
          console.error('[VideoNote] 启用自动填充失败:', e);
        }
      }, 3000);
    } catch (error) {
      console.error('[VideoNote] WebView 创建失败:', error);
      // 失败时可以 fallback 到 iframe
    }
  }, [noteFile, danmakuPrefix]);

  // 更新 WebView 大小
  const updateWebviewBounds = useCallback(async () => {
    if (!webviewCreated || !videoContainerRef.current) return;
    
    const container = videoContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      await invoke('update_webview_bounds', {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
    } catch (error) {
      console.error('[VideoNote] 更新 WebView 大小失败:', error);
    }
  }, [webviewCreated]);

  // 视频加载后创建 WebView
  useEffect(() => {
    if (isVideoLoaded && noteFile && !webviewCreated) {
      setTimeout(createWebview, 200);
    }
  }, [isVideoLoaded, noteFile, webviewCreated, createWebview]);

  // 监听窗口大小变化
  useEffect(() => {
    if (!webviewCreated) return;
    
    const handleResize = () => updateWebviewBounds();
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver(handleResize);
    if (videoContainerRef.current) {
      observer.observe(videoContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [webviewCreated, updateWebviewBounds]);

  // 组件卸载时关闭 WebView
  useEffect(() => {
    return () => {
      invoke('close_embedded_webview').catch(() => {});
    };
  }, []);

  // 根据 isActive 控制 WebView 可见性
  useEffect(() => {
    if (!webviewCreated) return;
    
    if (isActive) {
      // 激活时恢复位置
      updateWebviewBounds();
      invoke('set_webview_visible', { visible: true }).catch(() => {});
    } else {
      // 非激活时隐藏
      invoke('set_webview_visible', { visible: false }).catch(() => {});
    }
  }, [isActive, webviewCreated, updateWebviewBounds]);

  // 自动保存笔记到 MD 文件
  useEffect(() => {
    if (!noteFile || !vaultPath || !isVideoLoaded) return;
    
    const saveToFile = async () => {
      try {
        const notePath = getVideoNoteFilePath(vaultPath, noteFile.video.bvid);
        const mdContent = videoNoteToMarkdown(noteFile);
        await saveFile(notePath, mdContent);
        console.log(`[VideoNote] 自动保存: ${notePath}`);
      } catch (error) {
        console.error('[VideoNote] 自动保存失败:', error);
      }
    };
    
    // 防抖：500ms 后保存
    const timer = setTimeout(saveToFile, 500);
    return () => clearTimeout(timer);
  }, [noteFile, vaultPath, isVideoLoaded]);

  // 同步弹幕笔记
  const handleSyncDanmaku = useCallback(async () => {
    if (!noteFile) return;
    
    setIsSyncingDanmaku(true);
    try {
      // 1. 获取视频 CID
      const cid = await getVideoCid(noteFile.video.bvid);
      if (!cid) {
        alert('获取视频信息失败');
        return;
      }
      
      // 2. 获取弹幕列表
      const allDanmakus = await getDanmakuList(cid);
      console.log(`[Danmaku] 获取到 ${allDanmakus.length} 条弹幕`);
      
      // 3. 筛选笔记弹幕
      const noteDanmakus = filterNoteDanmakus(allDanmakus, danmakuPrefix);
      console.log(`[Danmaku] 找到 ${noteDanmakus.length} 条笔记弹幕`);
      
      // 显示部分弹幕内容用于调试
      console.log('[Danmaku] 前10条弹幕:', allDanmakus.slice(0, 10).map(d => d.content));
      
      if (noteDanmakus.length === 0) {
        // 显示更详细的信息
        const recentDanmakus = allDanmakus.slice(-5).map(d => `"${d.content}"`).join(', ');
        alert(`未找到以 "${danmakuPrefix}" 开头的弹幕\n\n共获取到 ${allDanmakus.length} 条弹幕\n最近5条: ${recentDanmakus || '无'}\n\n提示：\n1. B站弹幕有几分钟延迟\n2. 发送格式: ${danmakuPrefix}你的笔记`);
        return;
      }
      
      // 4. 转换为笔记（去除前缀，避免重复）
      const existingTimestamps = new Set(noteFile.notes.map(n => `${n.timestamp}-${n.content}`));
      let addedCount = 0;
      
      const newNotes: VideoNoteEntry[] = [];
      for (const dm of noteDanmakus) {
        const content = dm.content.substring(danmakuPrefix.length).trim();
        const key = `${Math.floor(dm.time)}-${content}`;
        
        if (!existingTimestamps.has(key) && content) {
          newNotes.push({
            id: generateNoteId(),
            timestamp: Math.floor(dm.time),
            content,
            createdAt: new Date(dm.timestamp * 1000).toISOString(),
          });
          addedCount++;
        }
      }
      
      if (newNotes.length > 0) {
        setNoteFile(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            updatedAt: new Date().toISOString(),
            notes: [...prev.notes, ...newNotes].sort((a, b) => a.timestamp - b.timestamp),
          };
        });
      }
      
      alert(`同步完成！新增 ${addedCount} 条笔记`);
      
    } catch (error) {
      console.error('[Danmaku] Sync failed:', error);
      alert('同步弹幕失败：' + error);
    } finally {
      setIsSyncingDanmaku(false);
    }
  }, [noteFile, danmakuPrefix]);

  // 加载视频 - 检查已有笔记或创建新笔记
  const handleLoadVideo = useCallback(async () => {
    const bvid = extractBvid(videoUrl);
    if (!bvid) {
      alert('请输入有效的B站视频链接');
      return;
    }
    
    try {
      // 检查是否已有笔记文件
      if (vaultPath) {
        const notePath = getVideoNoteFilePath(vaultPath, bvid);
        try {
          const existingContent = await readFile(notePath);
          if (existingContent) {
            const existingNote = parseVideoNoteMd(existingContent);
            if (existingNote) {
              console.log(`[VideoNote] 加载已有笔记: ${existingNote.notes.length} 条`);
              setNoteFile(existingNote);
              setIsVideoLoaded(true);
              return;
            }
          }
        } catch {
          // 文件不存在，继续创建新笔记
        }
      }
      
      // 创建新笔记
      const newNoteFile = createVideoNoteFile(videoUrl, `视频笔记-${bvid}`);
      setNoteFile(newNoteFile);
      setIsVideoLoaded(true);
    } catch (error) {
      alert('加载视频失败：' + error);
    }
  }, [videoUrl, vaultPath]);

  // 如果有初始 URL，自动设置
  useEffect(() => {
    if (effectiveUrl && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      setVideoUrl(effectiveUrl);
    }
  }, [effectiveUrl]);
  
  // videoUrl 变化且有值时自动加载
  useEffect(() => {
    if (videoUrl && !isVideoLoaded && autoLoadedRef.current) {
      handleLoadVideo();
    }
  }, [videoUrl, isVideoLoaded, handleLoadVideo]);

  // 手动计时器
  useEffect(() => {
    if (isVideoLoaded && isPlaying) {
      timeUpdateInterval.current = window.setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
      }
    };
  }, [isVideoLoaded, isPlaying]);

  // 处理时间输入（支持多种格式：5:32, 05:32, 5分32秒, 332）
  const handleTimeInputSubmit = useCallback(() => {
    const parsed = parseTimestamp(timeInput);
    if (parsed !== null) {
      setCurrentTime(parsed);
    }
    setIsEditingTime(false);
    setTimeInput('');
  }, [timeInput]);

  // 开始编辑时间
  const handleStartEditTime = useCallback(() => {
    setTimeInput(formatTimestamp(currentTime));
    setIsEditingTime(true);
  }, [currentTime]);

  // 添加笔记
  const handleAddNote = useCallback(() => {
    if (!noteFile || !newNoteContent.trim()) return;
    
    const newNote: VideoNoteEntry = {
      id: generateNoteId(),
      timestamp: currentTime,
      content: newNoteContent.trim(),
      createdAt: new Date().toISOString(),
    };
    
    setNoteFile(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        notes: [...prev.notes, newNote],
      };
    });
    
    setNewNoteContent('');
    setShowAddNote(false);
  }, [noteFile, currentTime, newNoteContent]);

  // 删除笔记
  const handleDeleteNote = useCallback((noteId: string) => {
    if (!confirm('确定要删除这条笔记吗？')) return;
    
    setNoteFile(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        notes: prev.notes.filter(n => n.id !== noteId),
      };
    });
  }, []);

  // 编辑笔记
  const handleStartEdit = useCallback((note: VideoNoteEntry) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingNoteId) return;
    
    setNoteFile(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        notes: prev.notes.map(n => 
          n.id === editingNoteId 
            ? { ...n, content: editContent }
            : n
        ),
      };
    });
    
    setEditingNoteId(null);
    setEditContent('');
  }, [editingNoteId, editContent]);

  // 跳转到时间点（通过 JS 直接控制播放器）
  const handleSeekTo = useCallback(async (seconds: number) => {
    setCurrentTime(seconds);
    
    // 通过 JS 注入直接跳转视频时间（不刷新页面）
    try {
      await invoke('seek_video_time', { seconds });
      console.log(`[VideoNote] 跳转到 ${formatTimestamp(seconds)}`);
    } catch (error) {
      console.error('[VideoNote] 跳转失败:', error);
    }
  }, []);

  // 导出为 Markdown
  const handleExport = useCallback(async () => {
    if (!noteFile || !vaultPath) return;
    
    const markdown = exportToMarkdown(noteFile);
    const fileName = `${noteFile.video.title}.md`;
    const filePath = `${vaultPath}/${fileName}`;
    
    try {
      await saveFile(filePath, markdown);
      alert(`已导出到：${fileName}`);
    } catch (error) {
      alert('导出失败：' + error);
    }
  }, [noteFile, vaultPath]);

  // 未加载视频时的输入界面
  if (!isVideoLoaded) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">视频笔记</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-accent rounded">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* 输入区 */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <Video className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">开始视频笔记</h3>
              <p className="text-sm text-muted-foreground mt-1">
                粘贴 B站视频链接，边看边记笔记
              </p>
            </div>
            
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="粘贴B站视频链接，如 https://www.bilibili.com/video/BV..."
              className="w-full px-4 py-3 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
            />
            
            <button
              onClick={() => handleLoadVideo()}
              disabled={!videoUrl.trim()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              开始笔记
            </button>
            
            <p className="text-xs text-center text-muted-foreground">
              支持 bilibili.com 和 b23.tv 链接
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 视频笔记主界面
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Video className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium truncate">{noteFile?.video.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.open(noteFile?.video.url, '_blank')}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="在浏览器中打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="导出为 Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
          {onMinimize && (
            <button 
              onClick={onMinimize} 
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="最小化（可通过左侧视频按钮恢复）"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-accent rounded">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 视频播放器区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 内嵌 WebView 区域 */}
          <div 
            ref={videoContainerRef}
            className="flex-1 bg-gradient-to-b from-gray-900 to-black relative"
          >
            {/* WebView 会覆盖在这个区域 */}
            {!webviewCreated && noteFile && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <div className="text-center">
                  <Video className="w-16 h-16 mx-auto mb-3 opacity-40 animate-pulse" />
                  <p className="text-lg">正在加载 B站视频...</p>
                  <p className="text-sm opacity-60 mt-1">首次加载可能需要几秒钟</p>
                </div>
              </div>
            )}
            {webviewCreated && (
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                ✓ WebView 已加载
              </div>
            )}
          </div>
          
          {/* 时间输入控制栏 */}
          <div className="p-4 border-t border-border bg-muted/50">
            <div className="flex items-center gap-3">
              {/* 时间输入区 */}
              <div className="flex items-center gap-2 bg-background rounded-lg p-2 border border-border">
                {/* 快退按钮 */}
                <button
                  onClick={() => setCurrentTime(prev => Math.max(0, prev - 30))}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="-30秒"
                >
                  -30s
                </button>
                <button
                  onClick={() => setCurrentTime(prev => Math.max(0, prev - 10))}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="-10秒"
                >
                  -10s
                </button>
                <button
                  onClick={() => setCurrentTime(prev => Math.max(0, prev - 1))}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="-1秒"
                >
                  -1s
                </button>
                
                {/* 时间显示/输入 */}
                {isEditingTime ? (
                  <input
                    type="text"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    onBlur={handleTimeInputSubmit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTimeInputSubmit();
                      if (e.key === 'Escape') setIsEditingTime(false);
                    }}
                    autoFocus
                    className="w-24 px-2 py-1 text-center font-mono text-lg bg-primary/10 border border-primary rounded"
                    placeholder="5:32"
                  />
                ) : (
                  <button
                    onClick={handleStartEditTime}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-accent rounded min-w-[100px] justify-center"
                    title="点击输入时间（如 5:32）"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="font-mono text-lg font-semibold">{formatTimestamp(currentTime)}</span>
                  </button>
                )}
                
                {/* 快进按钮 */}
                <button
                  onClick={() => setCurrentTime(prev => prev + 1)}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="+1秒"
                >
                  +1s
                </button>
                <button
                  onClick={() => setCurrentTime(prev => prev + 10)}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="+10秒"
                >
                  +10s
                </button>
                <button
                  onClick={() => setCurrentTime(prev => prev + 30)}
                  className="px-2 py-1 text-xs hover:bg-accent rounded"
                  title="+30秒"
                >
                  +30s
                </button>
              </div>
              
              {/* 计时器控制 */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-2 rounded-lg transition-colors ${isPlaying ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
                title={isPlaying ? '暂停计时' : '开始计时'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              
              <span className="text-sm text-muted-foreground">
                {isPlaying ? '计时中' : '已暂停'}
              </span>
              
              <div className="flex-1" />
              
              {/* 添加笔记按钮 */}
              <button
                onClick={() => setShowAddNote(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加笔记
              </button>
            </div>
            
            {/* 使用提示 */}
            <p className="mt-2 text-xs text-muted-foreground">
              💡 <strong>弹幕笔记</strong>：在B站发弹幕 <code className="px-1 bg-orange-500/20 text-orange-600 rounded">{danmakuPrefix}你的笔记</code>，然后点「同步弹幕」
            </p>
          </div>
        </div>

        {/* 笔记时间线 */}
        <div className="w-80 border-l border-border flex flex-col bg-muted/20">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">笔记时间线</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {noteFile?.notes.length || 0} 条笔记
                </p>
              </div>
              {/* 同步弹幕按钮 */}
              <button
                onClick={handleSyncDanmaku}
                disabled={isSyncingDanmaku}
                className="px-2 py-1 text-xs bg-orange-500/20 text-orange-600 hover:bg-orange-500/30 rounded transition-colors disabled:opacity-50"
                title={`从B站同步以 "${danmakuPrefix}" 开头的弹幕`}
              >
                {isSyncingDanmaku ? '同步中...' : '🎯 同步弹幕'}
              </button>
            </div>
            {/* 弹幕前缀配置 */}
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-muted-foreground">前缀:</span>
              <input
                type="text"
                value={danmakuPrefix}
                onChange={(e) => setDanmakuPrefix(e.target.value)}
                className="w-16 px-2 py-1 bg-muted border border-border rounded text-center font-mono"
                placeholder="NOTE:"
              />
              <button
                onClick={() => invoke('fill_danmaku_prefix', { prefix: danmakuPrefix })}
                className="px-2 py-1 bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 rounded transition-colors"
                title="自动填充前缀到弹幕输入框"
              >
                📝 填充
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {/* 添加笔记输入框 */}
            {showAddNote && (
              <div className="p-3 bg-background border border-primary rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Clock className="w-3 h-3" />
                  <span>{formatTimestamp(currentTime)}</span>
                </div>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="输入笔记内容..."
                  className="w-full h-20 p-2 text-sm bg-muted border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setShowAddNote(false);
                      setNewNoteContent('');
                    }}
                    className="px-2 py-1 text-xs hover:bg-accent rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAddNote}
                    disabled={!newNoteContent.trim()}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
            
            {/* 笔记列表 */}
            {noteFile?.notes
              .slice()
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-background border border-border rounded-lg hover:border-primary/50 transition-colors"
                >
                  {/* 时间戳 */}
                  <button
                    onClick={() => handleSeekTo(note.timestamp)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline mb-2"
                  >
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">{formatTimestamp(note.timestamp)}</span>
                  </button>
                  
                  {/* 内容 */}
                  {editingNoteId === note.id ? (
                    <div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-20 p-2 text-sm bg-muted border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1 mt-2">
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="p-1 hover:bg-accent rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="p-1 hover:bg-accent rounded text-primary"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      
                      {/* 操作按钮 */}
                      <div className="flex justify-end gap-1 mt-2 opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(note)}
                          className="p-1 hover:bg-accent rounded"
                          title="编辑"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 hover:bg-accent rounded text-red-500"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            
            {/* 空状态 */}
            {!showAddNote && (!noteFile?.notes.length) && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <p>暂无笔记</p>
                <p className="text-xs mt-1">点击「添加笔记」开始记录</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
