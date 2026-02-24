import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, Square } from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

/**
 * 语音输入悬浮球
 * 复用全局语音转文字 Hook，将识别结果追加到当前笔记末尾。
 * 10 秒无语音自动停止。
 */
export function VoiceInputBall() {
  const { currentFile } = useFileStore();
  const { t } = useLocaleStore();

  // 拖拽状态
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({
    x: 24,
    y: typeof window !== "undefined" ? window.innerHeight - 160 : 300,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const ballRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // 最终识别结果：通过全局事件交给编辑器，在光标位置插入
  const handleFinalText = useCallback((text: string) => {
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent("voice-input-final", { detail: { text } })
    );
  }, []);

  const { isRecording, interimText, toggleRecording } = useSpeechToText(handleFinalText, {
    silenceDurationMs: 10000,
  });

  // 中间结果：通过全局事件让编辑器做灰色流式预览
  useEffect(() => {
    const text = isRecording ? (interimText || "") : "";
    window.dispatchEvent(
      new CustomEvent("voice-input-interim", { detail: { text } })
    );
  }, [interimText, isRecording]);

  // 处理拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();

    hasDraggedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    const rect = ballRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    } else {
      dragOffsetRef.current = { x: 28, y: 28 };
    }

    setIsDragging(true);
  };

  // 全局拖拽事件
  useEffect(() => {
    if (!isDragging) return;

    let rafId: number | null = null;
    let lastX = position.x;
    let lastY = position.y;

    const handleMouseMove = (e: MouseEvent) => {
      const nx = Math.max(0, Math.min(window.innerWidth - 56, e.clientX - dragOffsetRef.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - 56, e.clientY - dragOffsetRef.current.y));

      lastX = nx;
      lastY = ny;

      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > 5 || dy > 5) {
        hasDraggedRef.current = true;
      }

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          setPosition({ x: lastX, y: lastY });
          rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, position.x, position.y]);

  // 点击：只有没有拖拽过才触发录音开关
  const handleClick = () => {
    if (!hasDraggedRef.current) {
      toggleRecording();
    }
  };

  // 没有打开的笔记时，不显示悬浮球
  if (!currentFile) return null;

  return createPortal(
    <div
      ref={ballRef}
      className="fixed z-40 select-none"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <button
        type="button"
        className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 border border-border
          ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-background text-muted-foreground hover:bg-accent"}
        `}
        title={isRecording ? t.speech.stopRecordingHint : t.speech.startRecordingHint}
      >
        {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
      </button>

      {/* 简单的实时识别预览 */}
      {isRecording && interimText && (
        <div className="mt-2 max-w-xs text-xs bg-background/95 border border-border rounded px-2 py-1 text-muted-foreground shadow-lg line-clamp-2">
          {interimText}
        </div>
      )}
    </div>,
    document.body
  );
}
