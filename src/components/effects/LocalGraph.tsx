import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useShallow } from "zustand/react/shallow";
import {
  buildLocalGraphData,
  type LocalEdge,
  type LocalGraphStatus,
  type LocalNode,
} from "./localGraphData";

interface LocalGraphProps {
  className?: string;
}

export function LocalGraph({ className = "" }: LocalGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<LocalNode[]>([]);
  const edgesRef = useRef<LocalEdge[]>([]);

  const { currentFile, openFile, currentContent } = useFileStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      openFile: state.openFile,
      currentContent: state.currentContent,
    }))
  );
  const {
    noteIndex,
    getBacklinks,
    isIndexing,
    truncated: indexTruncated,
  } = useNoteIndexStore(
    useShallow((state) => ({
      noteIndex: state.noteIndex,
      getBacklinks: state.getBacklinks,
      isIndexing: state.isIndexing,
      truncated: state.truncated,
    })),
  );

  const [dimensions, setDimensions] = useState({ width: 200, height: 150 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [graphStatus, setGraphStatus] = useState<LocalGraphStatus>({
    totalRelated: 0,
    displayedRelated: 0,
    hiddenRelated: 0,
    cappedByDisplayLimit: false,
  });

  // 获取当前文件名（不含扩展名）
  const getCurrentFileName = useCallback((): string | null => {
    if (!currentFile) return null;
    const parts = currentFile.split(/[/\\]/);
    const fileName = parts[parts.length - 1];
    return fileName.replace('.md', '');
  }, [currentFile]);

  const currentName = getCurrentFileName();
  const localGraphData = useMemo(() => {
    if (!currentFile || !currentFile.endsWith(".md") || !currentName) {
      return null;
    }

    return buildLocalGraphData({
      currentFile,
      currentContent,
      notes: Array.from(noteIndex.values()),
      backlinks: getBacklinks(currentName),
    });
  }, [currentFile, currentContent, currentName, noteIndex, getBacklinks]);

  // 当前文件、内容或全局索引变化时重建局部图谱
  useEffect(() => {
    if (!localGraphData) {
      nodesRef.current = [];
      edgesRef.current = [];
      setGraphStatus({
        totalRelated: 0,
        displayedRelated: 0,
        hiddenRelated: 0,
        cappedByDisplayLimit: false,
      });
      return;
    }

    const width = containerRef.current?.offsetWidth || 200;
    const height = containerRef.current?.offsetHeight || 150;
    const nodes = localGraphData.nodes.map((node) => ({ ...node }));

    const currentNode = nodes.find((node) => node.isCurrent);
    if (currentNode) {
      currentNode.x = width / 2;
      currentNode.y = height / 2;
    }

    const otherNodes = nodes.filter((node) => !node.isCurrent);
    const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);
    const radius = Math.min(width, height) * 0.35;

    otherNodes.forEach((node, i) => {
      const angle = i * angleStep - Math.PI / 2;
      node.x = width / 2 + Math.cos(angle) * radius;
      node.y = height / 2 + Math.sin(angle) * radius;
    });

    nodesRef.current = nodes;
    edgesRef.current = localGraphData.edges;
    setGraphStatus(localGraphData.status);
  }, [localGraphData, dimensions]);

  // 监听容器尺寸
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        setDimensions({ width: offsetWidth, height: offsetHeight });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 简单物理模拟
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const { width, height } = dimensions;
    const cx = width / 2;
    const cy = height / 2;

    // 中心节点固定
    const centerNode = nodes.find(n => n.isCurrent);
    if (centerNode) {
      centerNode.x = cx;
      centerNode.y = cy;
    }

    // 节点间斥力
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].isCurrent) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].isCurrent) continue;

        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 500 / (dist * dist);

        nodes[i].vx += (dx / dist) * force * 0.1;
        nodes[i].vy += (dy / dist) * force * 0.1;
        nodes[j].vx -= (dx / dist) * force * 0.1;
        nodes[j].vy -= (dy / dist) * force * 0.1;
      }
    }

    // 弹簧力（边）
    edges.forEach(edge => {
      const u = nodes.find(n => n.id === edge.source);
      const v = nodes.find(n => n.id === edge.target);
      if (!u || !v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = Math.min(width, height) * 0.3;
      const force = (dist - targetDist) * 0.02;

      if (!u.isCurrent) {
        u.vx += (dx / dist) * force;
        u.vy += (dy / dist) * force;
      }
      if (!v.isCurrent) {
        v.vx -= (dx / dist) * force;
        v.vy -= (dy / dist) * force;
      }
    });

    // 更新位置
    nodes.forEach(node => {
      if (node.isCurrent) return;

      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.9;
      node.vy *= 0.9;

      // 边界约束
      const margin = 20;
      node.x = Math.max(margin, Math.min(width - margin, node.x));
      node.y = Math.max(margin, Math.min(height - margin, node.y));
    });
  }, [dimensions]);

  // 渲染
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    simulate();

    ctx.clearRect(0, 0, width, height);

    // 绘制边
    edgesRef.current.forEach(edge => {
      const u = nodesRef.current.find(n => n.id === edge.source);
      const v = nodesRef.current.find(n => n.id === edge.target);
      if (!u || !v) return;

      const isHighlighted = hoverNode && (u.id === hoverNode || v.id === hoverNode);

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);
      ctx.strokeStyle = isHighlighted
        ? '#3b82f6'
        : 'rgba(128, 128, 128, 0.3)';
      ctx.lineWidth = isHighlighted ? 1.5 : 1;
      ctx.stroke();

      // 绘制箭头
      const angle = Math.atan2(v.y - u.y, v.x - u.x);
      const arrowLen = 6;
      const targetRadius = v.isCurrent ? 10 : 6;
      const arrowX = v.x - Math.cos(angle) * (targetRadius + 2);
      const arrowY = v.y - Math.sin(angle) * (targetRadius + 2);

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    });

    // 绘制节点
    nodesRef.current.forEach(node => {
      const isHovered = node.id === hoverNode;
      const radius = node.isCurrent ? 10 : 6;

      // 节点圆
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);

      if (node.isCurrent) {
        ctx.fillStyle = '#3b82f6'; // 蓝色 - 当前笔记
      } else if (node.isBacklink) {
        ctx.fillStyle = '#22c55e'; // 绿色 - 反向链接
      } else {
        ctx.fillStyle = '#60a5fa'; // 浅蓝色 - 出链
      }
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 标签
      if (isHovered || node.isCurrent) {
        ctx.fillStyle = '#333';
        ctx.font = `${node.isCurrent ? 'bold ' : ''}10px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 12);
      }
    });

    animationRef.current = requestAnimationFrame(render);
  }, [dimensions, hoverNode, simulate]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  // 交互处理
  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hovered = nodesRef.current.find(n => {
      const r = n.isCurrent ? 12 : 8;
      return Math.hypot(n.x - x, n.y - y) < r;
    });

    setHoverNode(hovered ? hovered.id : null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hovered ? 'pointer' : 'default';
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = nodesRef.current.find(n => {
      const r = n.isCurrent ? 12 : 8;
      return Math.hypot(n.x - x, n.y - y) < r;
    });

    if (clicked && !clicked.isCurrent) {
      openFile(clicked.path, { preview: true });
    }
  };

  // 如果没有当前文件或不是 md 文件，显示空状态
  if (!currentFile || !currentFile.endsWith('.md')) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-xs ${className}`}>
        无关联笔记
      </div>
    );
  }

  const outLinkCount = nodesRef.current.filter(n => !n.isCurrent && !n.isBacklink).length;
  const backLinkCount = nodesRef.current.filter(n => n.isBacklink).length;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        className="w-full h-full"
      />
      {/* 图例 */}
      <div className="absolute bottom-1 left-1 text-[9px] text-muted-foreground opacity-80">
        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#3b82f6' }} />当前
        {outLinkCount > 0 && (
          <>
            <span className="inline-block w-2 h-2 rounded-full ml-2 mr-1" style={{ background: '#60a5fa' }} />出链({outLinkCount})
          </>
        )}
        {backLinkCount > 0 && (
          <>
            <span className="inline-block w-2 h-2 rounded-full ml-2 mr-1" style={{ background: '#22c55e' }} />入链({backLinkCount})
          </>
        )}
        {isIndexing && <span className="ml-2">索引中</span>}
        {graphStatus.cappedByDisplayLimit && (
          <span className="ml-2">
            显示 {graphStatus.displayedRelated}/{graphStatus.totalRelated}，隐藏 {graphStatus.hiddenRelated}
          </span>
        )}
        {indexTruncated && <span className="ml-2">索引已截断</span>}
      </div>
    </div>
  );
}

export default LocalGraph;
