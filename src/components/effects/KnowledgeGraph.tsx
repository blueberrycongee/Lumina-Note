import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useShallow } from "zustand/react/shallow";
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FileText,
  Link as LinkIcon,
  MousePointer2,
  Settings,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface GraphNode {
  id: string;
  label: string;
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  isDragging?: boolean;
  isFolder?: boolean;        // 是否是文件夹
  parentId?: string;         // 父节点 ID
  color?: string;            // 节点颜色（来自所属文件夹）
  depth?: number;            // 层级深度
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'link' | 'hierarchy'; // link = 双链, hierarchy = 父子关系
}

// 预定义的文件夹颜色调色板（饱和度较高，用于文件夹刺球）
const FOLDER_COLORS = [
  'hsl(210, 65%, 50%)',  // 灰蓝
  'hsl(350, 60%, 55%)',  // 玫瑰粉
  'hsl(160, 55%, 42%)',  // 薄荷绿
  'hsl(270, 55%, 55%)',  // 淡紫
  'hsl(30, 70%, 50%)',   // 暖橙
  'hsl(185, 55%, 45%)',  // 青蓝
  'hsl(50, 65%, 48%)',   // 暖黄
  'hsl(320, 55%, 52%)',  // 淡洋红
  'hsl(95, 50%, 45%)',   // 橄榄绿
  'hsl(225, 60%, 55%)',  // 靛蓝
];

// 文件节点颜色（基于文件夹颜色，但更柔和/更浅）
const FILE_COLORS = [
  'hsl(210, 40%, 70%)',  // 灰蓝（浅）
  'hsl(350, 35%, 72%)',  // 玫瑰粉（浅）
  'hsl(160, 30%, 62%)',  // 薄荷绿（浅）
  'hsl(270, 30%, 70%)',  // 淡紫（浅）
  'hsl(30, 45%, 68%)',   // 暖橙（浅）
  'hsl(185, 30%, 62%)',  // 青蓝（浅）
  'hsl(50, 40%, 65%)',   // 暖黄（浅）
  'hsl(320, 30%, 68%)',  // 淡洋红（浅）
  'hsl(95, 25%, 62%)',   // 橄榄绿（浅）
  'hsl(225, 35%, 72%)',  // 靛蓝（浅）
];

// Extract [[wikilinks]] from content
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)]; // Remove duplicates
}

// Physics Engine
const PhysicsEngine = {
  init: (nodes: GraphNode[], width: number, height: number): GraphNode[] => {
    return nodes.map((n, i) => ({
      ...n,
      x: width / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 50,
      y: height / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 50,
      vx: 0,
      vy: 0,
    }));
  },

  step: (
    nodes: GraphNode[],
    edges: GraphEdge[],
    params: {
      repulsion: number;
      springLength: number;
      springStrength: number;
      centerPull: number;
      friction: number;
      dt: number;
      width: number;
      height: number;
    }
  ): GraphNode[] => {
    const { repulsion, springLength, springStrength, centerPull, friction, dt, width, height } = params;
    const cx = width / 2;
    const cy = height / 2;

    // 构建节点索引 Map（O(1) 查找）
    const nodeMap = new Map<string, GraphNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const v = nodes[j];
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        let distSq = dx * dx + dy * dy;
        if (distSq === 0) distSq = 0.01;
        const dist = Math.sqrt(distSq);

        if (dist < 500) {
          const force = repulsion / (distSq + 100);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!u.isDragging) { u.vx += fx * dt; u.vy += fy * dt; }
          if (!v.isDragging) { v.vx -= fx * dt; v.vy -= fy * dt; }
        }
      }
    }

    // Spring forces (edges) - 使用 Map O(1) 查找
    edges.forEach((e) => {
      const u = nodeMap.get(e.source);
      const v = nodeMap.get(e.target);
      if (!u || !v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const force = (dist - springLength) * springStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!u.isDragging) { u.vx += fx * dt; u.vy += fy * dt; }
      if (!v.isDragging) { v.vx -= fx * dt; v.vy -= fy * dt; }
    });

    // Center pull and update positions
    nodes.forEach((n) => {
      if (n.isDragging) return;

      const dx = cx - n.x;
      const dy = cy - n.y;
      n.vx += dx * centerPull * dt;
      n.vy += dy * centerPull * dt;

      n.x += n.vx * dt;
      n.y += n.vy * dt;

      n.vx *= friction;
      n.vy *= friction;

      // Circular soft boundary constraint
      // 计算到中心的距离
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      // 圆形边界半径（取宽高最小值的一半，留一点边距）
      const boundaryRadius = Math.min(width, height) * 0.45;

      // 如果超出边界，施加一个柔和的向心力（力度随超出程度增加）
      if (distToCenter > boundaryRadius) {
        const overflow = distToCenter - boundaryRadius;
        // 柔和的弹性力，超出越多力越大
        const pullStrength = overflow * 0.05;
        const pullX = (dx / distToCenter) * pullStrength;
        const pullY = (dy / distToCenter) * pullStrength;
        n.vx += pullX * dt;
        n.vy += pullY * dt;
      }
    });

    return nodes;
  },
};

interface KnowledgeGraphProps {
  className?: string;
  isolatedNode?: {
    id: string;
    label: string;
    path: string;
    isFolder: boolean;
  };
}

// 右键菜单状态
interface ContextMenuState {
  x: number;
  y: number;
  node: GraphNode;
}

// ==================== 全局图数据缓存 ====================
// 避免每个 KnowledgeGraph 实例重复读取文件
interface GraphCache {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fileTreeHash: string; // 用于检测文件树是否变化
  timestamp: number;
}

let graphCache: GraphCache | null = null;

// 计算文件树的简单哈希（用于检测变化）
function computeFileTreeHash(fileTree: any[]): string {
  return JSON.stringify(fileTree.map(f => f.path)).slice(0, 100);
}

export function KnowledgeGraph({ className = "", isolatedNode }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const { fileTree, currentFile, openFile, openIsolatedGraphTab } = useFileStore(
    useShallow((state) => ({
      fileTree: state.fileTree,
      currentFile: state.currentFile,
      openFile: state.openFile,
      openIsolatedGraphTab: state.openIsolatedGraphTab,
    }))
  );
  const { t } = useLocaleStore();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const isDraggingCanvas = useRef(false);
  const isDraggingNode = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const draggedNodeId = useRef<string | null>(null);
  const hasDragged = useRef(false); // 是否发生了拖拽
  const clickedNodeRef = useRef<GraphNode | null>(null); // 点击的节点

  const [params, setParams] = useState({
    repulsion: 3000,
    springLength: 100,
    springStrength: 0.08,
    centerPull: 0.015,
    friction: 0.88,
    dt: 0.15,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [nodeSize, setNodeSize] = useState(1.0);
  const [showLabels, setShowLabels] = useState(true);
  const [showFolders, setShowFolders] = useState(true); // 是否显示文件夹节点

  // 应用图数据（支持孤立视图过滤和文件夹过滤）- 必须在 buildGraph 之前定义
  const applyGraphData = useCallback((nodes: GraphNode[], edges: GraphEdge[], includeFolders: boolean) => {
    let displayNodes = nodes;
    let displayEdges = edges;

    // 如果不显示文件夹，过滤掉文件夹节点和层级边
    if (!includeFolders) {
      displayNodes = nodes.filter(n => !n.isFolder);
      displayEdges = edges.filter(e => e.type === 'link'); // 只保留双链边
    }

    if (isolatedNode) {
      // 找到目标节点的所有直接相连节点
      const connectedIds = new Set<string>();
      connectedIds.add(isolatedNode.id);

      for (const edge of displayEdges) {
        if (edge.source === isolatedNode.id) {
          connectedIds.add(edge.target);
        }
        if (edge.target === isolatedNode.id) {
          connectedIds.add(edge.source);
        }
      }

      displayNodes = displayNodes.filter(n => connectedIds.has(n.id));
      displayEdges = displayEdges.filter(e =>
        connectedIds.has(e.source) && connectedIds.has(e.target)
      );
    }

    // Initialize positions
    const width = containerRef.current?.offsetWidth || 400;
    const height = containerRef.current?.offsetHeight || 400;
    nodesRef.current = PhysicsEngine.init(displayNodes, width, height);
    edgesRef.current = displayEdges;

    setDimensions({ width, height });
  }, [isolatedNode]);

  // Build graph from file tree
  const buildGraph = useCallback(async () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();
    const folderColorMap = new Map<string, { folderColor: string; fileColor: string }>(); // 文件夹路径 -> 颜色对
    let colorIndex = 0;

    // 递归处理文件树，同时创建文件夹节点和父子关系
    const processEntries = (entries: typeof fileTree, parentPath: string | null, depth: number) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          // 为文件夹分配颜色（文件夹用饱和色，文件用柔和色）
          const idx = colorIndex % FOLDER_COLORS.length;
          const folderColor = FOLDER_COLORS[idx];
          const fileColor = FILE_COLORS[idx];
          folderColorMap.set(entry.path, { folderColor, fileColor });
          colorIndex++;

          // 创建文件夹节点
          const folderId = `folder:${entry.path}`;
          const folderNode: GraphNode = {
            id: folderId,
            label: entry.name,
            path: entry.path,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            connections: 0,
            isFolder: true,
            parentId: parentPath ? `folder:${parentPath}` : undefined,
            color: folderColor, // 文件夹使用饱和色
            depth,
          };
          nodes.push(folderNode);
          nodeMap.set(folderId, folderNode);

          // 创建父子关系边（如果有父文件夹）
          if (parentPath) {
            edges.push({
              source: `folder:${parentPath}`,
              target: folderId,
              type: 'hierarchy',
            });
          }

          // 递归处理子项
          processEntries(entry.children, entry.path, depth + 1);
        } else if (!entry.is_dir && entry.name.endsWith(".md")) {
          // 文件节点
          const nodeName = entry.name.replace(".md", "");

          // 获取文件所在文件夹的颜色（子层覆盖父层）
          let nodeColor = 'hsl(var(--muted-foreground))';

          // 查找最近的父文件夹颜色，文件使用柔和色
          for (const [folderPath, colors] of folderColorMap.entries()) {
            if (entry.path.startsWith(folderPath)) {
              nodeColor = colors.fileColor; // 文件使用柔和色
            }
          }

          const fileNode: GraphNode = {
            id: nodeName,
            label: nodeName,
            path: entry.path,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            connections: 0,
            isFolder: false,
            parentId: parentPath ? `folder:${parentPath}` : undefined,
            color: nodeColor,
            depth,
          };
          nodes.push(fileNode);
          nodeMap.set(nodeName.toLowerCase(), fileNode);

          // 创建文件到父文件夹的父子关系边
          if (parentPath) {
            edges.push({
              source: `folder:${parentPath}`,
              target: nodeName,
              type: 'hierarchy',
            });
          }
        }
      }
    };

    processEntries(fileTree, null, 0);

    // 读取文件内容，提取双链
    const { readFile } = await import("@/lib/tauri");

    // 限制并发读取数量，避免阻塞 RPC 通道
    const BATCH_SIZE = 10;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (node) => {
        if (node.isFolder) return;
        try {
          const content = await readFile(node.path);
          const links = extractWikiLinks(content);

          for (const linkName of links) {
            const targetNode = nodeMap.get(linkName.toLowerCase());
            if (targetNode && targetNode.id !== node.id && !targetNode.isFolder) {
              // 检查双链边是否已存在
              const exists = edges.some(
                (e) =>
                  e.type === 'link' &&
                  ((e.source === node.id && e.target === targetNode.id) ||
                    (e.source === targetNode.id && e.target === node.id))
              );
              if (!exists) {
                edges.push({ source: node.id, target: targetNode.id, type: 'link' });
                node.connections++;
                targetNode.connections++;
              }
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }));
    }

    // 保存到全局缓存
    graphCache = {
      nodes,
      edges,
      fileTreeHash: computeFileTreeHash(fileTree),
      timestamp: Date.now(),
    };

    applyGraphData(nodes, edges, showFolders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTree, applyGraphData]); // showFolders 变化时不需要重建，只需要 loadGraph 重新应用缓存

  // 使用缓存或构建新图
  const loadGraph = useCallback(async () => {
    const currentHash = computeFileTreeHash(fileTree);

    // 如果有缓存且文件树没变，直接使用缓存
    if (graphCache && graphCache.fileTreeHash === currentHash) {
      console.log("[Graph] Using cached data");
      applyGraphData(graphCache.nodes, graphCache.edges, showFolders);
      return;
    }

    // 否则重新构建
    console.log("[Graph] Building new graph...");
    await buildGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTree, buildGraph, applyGraphData]); // showFolders 由专门的 effect 处理

  // Build graph on mount and when file tree changes
  useEffect(() => {
    if (fileTree.length > 0) {
      loadGraph();
    }
  }, [fileTree, loadGraph]);

  // 当 showFolders 切换时，直接从缓存重新应用（无需重建）
  useEffect(() => {
    if (graphCache) {
      applyGraphData(graphCache.nodes, graphCache.edges, showFolders);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFolders]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Render loop with high DPI support
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size for high DPI
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    PhysicsEngine.step(nodesRef.current, edgesRef.current, { ...params, width, height });

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    const hasSelection = selectedNode !== null || hoverNode !== null;

    // Draw edges
    edgesRef.current.forEach((edge) => {
      const u = nodesRef.current.find((n) => n.id === edge.source);
      const v = nodesRef.current.find((n) => n.id === edge.target);
      if (!u || !v) return;

      const isHighlighted =
        (hoverNode && (u.id === hoverNode || v.id === hoverNode)) ||
        (selectedNode && (u.id === selectedNode.id || v.id === selectedNode.id));

      const isHierarchy = edge.type === 'hierarchy';

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);

      if (hasSelection) {
        if (isHighlighted) {
          ctx.strokeStyle = isHierarchy ? (u.color || "hsl(var(--primary))") : "hsl(var(--primary))";
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = (isHierarchy ? 2.5 : 2) / zoom;
        } else {
          ctx.strokeStyle = "hsl(var(--muted-foreground))";
          ctx.globalAlpha = 0.1;
          ctx.lineWidth = 1 / zoom;
        }
      } else {
        if (isHierarchy) {
          ctx.strokeStyle = u.color || "hsl(var(--muted-foreground))";
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.5 / zoom;
        } else {
          ctx.strokeStyle = "hsl(var(--muted-foreground))";
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1 / zoom;
        }
      }
      ctx.stroke();

      // 绘制箭头（仅层级边）
      if (isHierarchy) {
        const angle = Math.atan2(v.y - u.y, v.x - u.x);
        const arrowLen = 8 / zoom;
        const targetRadius = v.isFolder ? 12 : 8;
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
      }
    });

    // Draw nodes
    nodesRef.current.forEach((node) => {
      const isHovered = node.id === hoverNode;
      const isSelected = selectedNode && node.id === selectedNode.id;
      const isCurrent = !node.isFolder && currentFile?.includes(node.label);

      let isNeighbor = false;
      const targetId = hoverNode || (selectedNode ? selectedNode.id : null);
      if (targetId) {
        isNeighbor = edgesRef.current.some(
          (e) =>
            (e.source === targetId && e.target === node.id) ||
            (e.target === targetId && e.source === node.id)
        );
      }

      const isHighlighted = isHovered || isSelected || isNeighbor || isCurrent;

      ctx.globalAlpha = hasSelection && !isHighlighted ? 0.15 : 1;

      // 使用对数缩放，限制最大尺寸
      const baseRadius = node.isFolder
        ? Math.max(8, 10 + Math.log((node.connections || 1) + 1) * 3)
        : Math.max(4, 5 + Math.log(node.connections + 1) * 4);
      const radius = Math.min(baseRadius * nodeSize, node.isFolder ? 30 : 25);

      // 确定节点颜色
      let nodeColor = node.color || "hsl(var(--muted-foreground))";
      if (isCurrent) {
        nodeColor = "hsl(var(--primary))";
      } else if (isHighlighted && !node.isFolder) {
        // 高亮时稍微调亮
        nodeColor = node.color || "hsl(var(--primary) / 0.8)";
      }

      if (node.isFolder) {
        // 绘制带刺圆球（星形/太阳形）
        const spikes = 8;
        const outerRadius = radius;
        const innerRadius = radius * 0.6;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i * Math.PI) / spikes - Math.PI / 2;
          const x = node.x + Math.cos(angle) * r;
          const y = node.y + Math.sin(angle) * r;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fillStyle = nodeColor;
        ctx.fill();

        // 文件夹节点边框
        ctx.strokeStyle = isHighlighted ? "hsl(var(--foreground))" : nodeColor;
        ctx.lineWidth = (isHighlighted ? 2.5 : 1.5) / zoom;
        ctx.stroke();

        // 中心小圆
        ctx.beginPath();
        ctx.arc(node.x, node.y, innerRadius * 0.5, 0, 2 * Math.PI);
        ctx.fillStyle = "hsl(var(--background))";
        ctx.fill();
      } else {
        // 普通文件节点 - 圆形
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = nodeColor;
        ctx.fill();

        // Node border
        if (isHighlighted) {
          ctx.strokeStyle = "hsl(var(--foreground))";
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        }
      }

      // Label
      if (showLabels && (isHighlighted || zoom > 0.8)) {
        ctx.globalAlpha = isHighlighted ? 1 : (hasSelection ? 0.15 : 0.7);
        ctx.fillStyle = "hsl(var(--foreground))";
        const fontSize = node.isFolder ? Math.max(11, 13 / zoom) : Math.max(10, 12 / zoom);
        ctx.font = `${node.isFolder ? 'bold ' : ''}${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + radius + 14 / zoom);
      }
    });

    ctx.restore();
    animationRef.current = requestAnimationFrame(render);
  }, [params, zoom, pan, hoverNode, selectedNode, currentFile, dimensions, nodeSize, showLabels]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  // Interaction handlers
  const getScreenPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getWorldPos = (screenX: number, screenY: number) => {
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    return {
      x: (screenX - cx - pan.x) / zoom + cx,
      y: (screenY - cy - pan.y) / zoom + cy,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 右键点击不处理拖拽和节点点击（由 contextMenu 处理）
    if (e.button === 2) return;

    const { x, y } = getScreenPos(e);
    const worldPos = getWorldPos(x, y);

    hasDragged.current = false; // 重置拖拽状态
    dragStart.current = { x, y };

    const clickedNode = nodesRef.current.find((n) => {
      const baseR = Math.max(4, 5 + Math.log(n.connections + 1) * 4);
      const r = Math.min(baseR * nodeSize, 25) + 8; // 使用相同的半径计算
      return Math.hypot(n.x - worldPos.x, n.y - worldPos.y) < r;
    });

    if (clickedNode) {
      isDraggingNode.current = true;
      draggedNodeId.current = clickedNode.id;
      clickedNodeRef.current = clickedNode;
      clickedNode.isDragging = true;
      setSelectedNode(clickedNode);
    } else {
      isDraggingCanvas.current = true;
      clickedNodeRef.current = null;
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getScreenPos(e);
    const worldPos = getWorldPos(x, y);

    if (!isDraggingNode.current && !isDraggingCanvas.current) {
      const hovered = nodesRef.current.find((n) => {
        const r = Math.max(4, 5 + n.connections * 1.5) + 5;
        return Math.hypot(n.x - worldPos.x, n.y - worldPos.y) < r;
      });
      setHoverNode(hovered ? hovered.id : null);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hovered ? "pointer" : "crosshair";
      }
    }

    if (isDraggingNode.current && draggedNodeId.current) {
      const node = nodesRef.current.find((n) => n.id === draggedNodeId.current);
      if (node) {
        // 检测是否真的在拖拽（移动超过 3 像素）
        const dx = x - dragStart.current.x;
        const dy = y - dragStart.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasDragged.current = true;
        }

        node.x = worldPos.x;
        node.y = worldPos.y;
        node.vx = 0;
        node.vy = 0;
      }
    }

    if (isDraggingCanvas.current) {
      const dx = x - dragStart.current.x;
      const dy = y - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged.current = true;
      }
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      dragStart.current = { x, y };
    }
  };

  const handleMouseUp = () => {
    // 如果点击了节点且没有拖拽，则打开笔记（文件夹节点不打开）
    if (clickedNodeRef.current && !hasDragged.current && !clickedNodeRef.current.isFolder) {
      openFile(clickedNodeRef.current.path);
    }

    if (isDraggingNode.current && draggedNodeId.current) {
      const node = nodesRef.current.find((n) => n.id === draggedNodeId.current);
      if (node) node.isDragging = false;
    }
    isDraggingNode.current = false;
    isDraggingCanvas.current = false;
    draggedNodeId.current = null;
    clickedNodeRef.current = null;
  };

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    // 如果已经是孤立视图，不显示右键菜单
    if (isolatedNode) return;

    const { x, y } = getScreenPos(e);
    const worldPos = getWorldPos(x, y);

    // 查找右键点击的节点
    const clickedNode = nodesRef.current.find((n) => {
      const baseR = Math.max(4, 5 + Math.log(n.connections + 1) * 4);
      const r = Math.min(baseR * nodeSize, 25) + 8;
      return Math.hypot(n.x - worldPos.x, n.y - worldPos.y) < r;
    });

    if (clickedNode) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node: clickedNode,
      });
    } else {
      setContextMenu(null);
    }
  };

  // 处理孤立查看
  const handleIsolateView = () => {
    if (!contextMenu) return;

    const node = contextMenu.node;
    openIsolatedGraphTab({
      id: node.id,
      label: node.label,
      path: node.path,
      isFolder: node.isFolder || false,
    });

    setContextMenu(null);
  };

  // 使用原生事件监听器处理 wheel 事件（需要 passive: false 才能 preventDefault）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.min(Math.max(z * delta, 0.3), 3));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const handleNodeClick = (node: GraphNode) => {
    if (!node.isFolder) {
      openFile(node.path);
    }
  };

  // Get connected nodes for selected node
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return edgesRef.current
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const targetId = e.source === selectedNode.id ? e.target : e.source;
        return nodesRef.current.find((n) => n.id === targetId);
      })
      .filter(Boolean) as GraphNode[];
  }, [selectedNode]);

  return (
    <div className={`flex h-full ${className}`}>
      {/* Settings Panel */}
      <div className={cn(
        "w-64 border-r border-border bg-background flex-shrink-0 overflow-y-auto transition-all duration-200",
        showSettings ? "opacity-100" : "w-0 opacity-0 overflow-hidden"
      )}>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.knowledgeGraph.settings}</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {/* Physics */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.knowledgeGraph.physics}</h4>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{t.knowledgeGraph.nodeRepulsion}</span>
                <span className="text-muted-foreground">{params.repulsion}</span>
              </div>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={params.repulsion}
                onChange={(e) => setParams({ ...params, repulsion: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{t.knowledgeGraph.linkLength}</span>
                <span className="text-muted-foreground">{params.springLength}</span>
              </div>
              <input
                type="range"
                min="30"
                max="300"
                step="10"
                value={params.springLength}
                onChange={(e) => setParams({ ...params, springLength: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{t.knowledgeGraph.centerPull}</span>
                <span className="text-muted-foreground">{params.centerPull.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.05"
                step="0.001"
                value={params.centerPull}
                onChange={(e) => setParams({ ...params, centerPull: Number(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          {/* Visual */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.knowledgeGraph.visual}</h4>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{t.knowledgeGraph.nodeSize}</span>
                <span className="text-muted-foreground">{nodeSize.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={nodeSize}
                onChange={(e) => setNodeSize(Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded border-border"
              />
              <span>{t.knowledgeGraph.showLabels}</span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showFolders}
                onChange={(e) => setShowFolders(e.target.checked)}
                className="rounded border-border"
              />
              <span>{t.knowledgeGraph.showFolders}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col">
        {/* Controls */}
        <div className="p-2 border-b border-border flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-1.5 rounded transition-colors",
                showSettings ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
              title={t.knowledgeGraph.settings}
            >
              <Settings size={16} />
            </button>
            <span className="text-xs text-muted-foreground">
              {nodesRef.current.length} {t.graph.nodes} · {edgesRef.current.length} {t.graph.edges}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.min(z * 1.2, 3))}
              className="p-1 hover:bg-muted rounded text-muted-foreground"
            >
              <ZoomIn size={14} />
            </button>
            <span className="text-[10px] w-10 text-center text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
              className="p-1 hover:bg-muted rounded text-muted-foreground"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={buildGraph}
              className="p-1 hover:bg-muted rounded text-muted-foreground ml-1"
              title={t.sidebar.refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative bg-muted/20 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onMouseDown={(e) => {
              setContextMenu(null); // 点击时关闭右键菜单
              handleMouseDown(e);
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
            onDoubleClick={() => {
              if (selectedNode) {
                handleNodeClick(selectedNode);
              }
            }}
            className="block w-full h-full cursor-crosshair active:cursor-move"
          />

          {/* 右键菜单 */}
          {contextMenu && (
            <div
              className="fixed z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[140px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
                {contextMenu.node.label}
              </div>
              <button
                onClick={handleIsolateView}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
                </svg>
                {t.knowledgeGraph.isolateView}
              </button>
              {!contextMenu.node.isFolder && (
                <button
                  onClick={() => {
                    openFile(contextMenu.node.path);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {t.knowledgeGraph.openNote}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Node details */}
        {selectedNode && (
          <div className="p-3 border-t border-border bg-background space-y-2 max-h-40 overflow-y-auto">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-primary" />
              <span
                className="text-sm font-medium text-foreground hover:text-primary cursor-pointer"
                onClick={() => handleNodeClick(selectedNode)}
              >
                {selectedNode.label}
              </span>
            </div>
            {connectedNodes.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                  <LinkIcon size={10} />
                  {t.knowledgeGraph.linkedNotes} ({connectedNodes.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {connectedNodes.slice(0, 8).map((node) => (
                    <button
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        openFile(node.path);
                      }}
                      className="text-xs px-2 py-0.5 bg-muted rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {node.label}
                    </button>
                  ))}
                  {connectedNodes.length > 8 && (
                    <span className="text-xs text-muted-foreground">
                      +{connectedNodes.length - 8}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {nodesRef.current.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MousePointer2 size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t.knowledgeGraph.noLinkedNotes}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
