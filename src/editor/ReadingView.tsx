import { useMemo, useCallback, useEffect, useRef } from "react";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useFileStore } from "@/stores/useFileStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { parseLuminaLink } from "@/services/pdf/annotations";
import { readBinaryFileBase64 } from "@/lib/host";
import { getImageMimeType, resolveEditorImagePath } from "@/services/assets/editorImages";
import mermaid from "mermaid";
import { useShallow } from "zustand/react/shallow";
import { pluginRenderRuntime } from "@/services/plugins/renderRuntime";
import { resolveWikiLinkPath } from "@/lib/wikiLinks";
import { useWikiLinkHover } from "@/lib/useWikiLinkHover";
import { WikiLinkHoverCard } from "@/components/wiki/WikiLinkHoverCard";

// 初始化 mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

interface ReadingViewProps {
  content: string;
  className?: string;
  filePath?: string | null;
}

export function ReadingView({ content, className = "", filePath = null }: ReadingViewProps) {
  const { fileTree, openFile, vaultPath, currentFile } = useFileStore(
    useShallow((state) => ({
      fileTree: state.fileTree,
      openFile: state.openFile,
      vaultPath: state.vaultPath,
      currentFile: state.currentFile,
    }))
  );
  const { openSecondaryPdf } = useSplitStore();
  const { setSplitView } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    return parseMarkdown(content);
  }, [content]);

  // 渲染 Mermaid 图表
  useEffect(() => {
    if (!containerRef.current) return;
    
    const mermaidElements = containerRef.current.querySelectorAll('.mermaid');
    if (mermaidElements.length === 0) return;
    
    // 异步渲染 mermaid
    const renderMermaid = async () => {
      try {
        // 重新初始化以支持主题切换
        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        });
        
        await mermaid.run({
          nodes: mermaidElements as NodeListOf<HTMLElement>,
        });
      } catch (err) {
        console.error('[Mermaid] Render failed:', err);
      }
    };
    
    renderMermaid();
  }, [html]);

  // Plugin reading view post-processors (DOM lifecycle).
  useEffect(() => {
    if (!containerRef.current) return;
    const unmount = pluginRenderRuntime.mountReadingView(containerRef.current);
    return () => unmount();
  }, [html]);

  // 转换本地图片路径为 base64 data URL
  useEffect(() => {
    if (!containerRef.current || !vaultPath) return;
    
    const images = containerRef.current.querySelectorAll('img');
    images.forEach((imgEl) => {
      const img = imgEl as HTMLImageElement;
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        const fullPath = resolveEditorImagePath({
          src,
          notePath: filePath ?? currentFile,
          vaultPath,
        });
        if (!fullPath) return;
        
        img.style.opacity = '0.5';
        
        readBinaryFileBase64(fullPath)
          .then(base64 => {
            img.src = `data:${getImageMimeType(fullPath)};base64,${base64}`;
            img.style.opacity = '1';
          })
          .catch(err => {
            console.error('[ReadingView] Image load failed:', fullPath, err);
            img.alt = `${useLocaleStore.getState().t.editor.imageLoadFailed}: ${src}`;
            img.style.opacity = '1';
          });
      }
    });
  }, [currentFile, filePath, html, vaultPath]);

  // Callout fold toggle in preview mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCalloutFold = (e: MouseEvent) => {
      const title = (e.target as HTMLElement).closest('.callout-title');
      if (!title) return;
      const callout = title.closest('.callout');
      if (!callout?.querySelector('.callout-fold')) return;
      e.stopPropagation();
      callout.classList.toggle('callout-folded');
    };

    container.addEventListener('click', handleCalloutFold);
    return () => container.removeEventListener('click', handleCalloutFold);
  }, [html]);

  // Handle WikiLink, Tag, and Lumina link clicks
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Handle lumina:// PDF links (Ctrl+Click to open in split view)
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href && href.startsWith('lumina://pdf')) {
        e.preventDefault();
        const parsed = parseLuminaLink(href);
        if (parsed && parsed.file) {
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click: open in split view
            setSplitView(true);
            openSecondaryPdf(parsed.file, parsed.page || 1, parsed.id);
          } else {
            // Normal click: open in main view via fileStore
            const { openPDFTab } = useFileStore.getState();
            openPDFTab(parsed.file);
            // TODO: navigate to page and highlight annotation
          }
        }
        return;
      }
    }
    
    // Handle WikiLink clicks
    if (target.classList.contains("wikilink")) {
      e.preventDefault();
      const linkName = target.getAttribute("data-wikilink");
      if (linkName) {
        const filePath = resolveWikiLinkPath(fileTree, linkName);
        if (filePath) {
          openFile(filePath);
        } else {
          console.log(`Note not found: ${linkName}`);
        }
      }
    }
    
    // Handle Tag clicks - dispatch event to show tag in sidebar
    if (target.classList.contains("tag")) {
      e.preventDefault();
      const tagName = target.getAttribute("data-tag");
      if (tagName) {
        // Dispatch custom event for the right panel to handle
        window.dispatchEvent(
          new CustomEvent("tag-clicked", { detail: { tag: tagName } })
        );
      }
      return;
    }
  }, [
    fileTree,
    openFile,
    openSecondaryPdf,
    setSplitView,
  ]);

  // Wiki-link hover preview. Uses pointer-intent against the rendered
  // body — the parseMarkdown() pass above tags every wikilink with
  // `data-wikilink="<target>"`, which is what the hook listens for.
  const { anchor: hoverAnchor, linkName: hoverLink, close: closeHover } =
    useWikiLinkHover(containerRef);

  return (
    <>
      <div
        ref={containerRef}
        // Match the live/source editor's centered text column so the
        // reading-mode layout doesn't visibly shift when the user toggles
        // modes, and stays identical as sidebars collapse/expand. The actual
        // max-width and padding live on `.reading-view` in globals.css so
        // they can stay in lock-step with the CM .cm-sizer / .cm-content /
        // .cm-line stack.
        className={`reading-view prose prose-neutral dark:prose-invert mx-auto ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
      <WikiLinkHoverCard anchor={hoverAnchor} linkName={hoverLink} onClose={closeHover} />
    </>
  );
}
