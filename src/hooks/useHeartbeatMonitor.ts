/**
 * 心跳监控 Hook
 * 
 * 监控 Rust Agent 的连接状态，检测假死和断连
 */

import { useEffect, useRef, useCallback } from "react";
import { useRustAgentStore } from "@/stores/useRustAgentStore";

// 心跳超时阈值（毫秒）
const HEARTBEAT_TIMEOUT = 45000; // 45秒无心跳认为断连
const CHECK_INTERVAL = 5000; // 每5秒检查一次

export interface HeartbeatMonitorOptions {
  /** 心跳超时时触发 */
  onTimeout?: () => void;
  /** 连接恢复时触发 */
  onReconnect?: () => void;
  /** 是否启用监控 */
  enabled?: boolean;
}

/**
 * 心跳监控 Hook
 * 
 * 在 Agent 运行时监控心跳，检测连接状态
 */
export function useHeartbeatMonitor(options: HeartbeatMonitorOptions = {}) {
  const { onTimeout, onReconnect, enabled = true } = options;
  
  const status = useRustAgentStore((s) => s.status);
  const lastHeartbeat = useRustAgentStore((s) => s.lastHeartbeat);
  const connectionStatus = useRustAgentStore((s) => s.connectionStatus);
  
  const wasDisconnectedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 检查心跳超时
  const checkHeartbeat = useCallback(() => {
    if (!lastHeartbeat) return;
    
    const elapsed = Date.now() - lastHeartbeat;
    
    if (elapsed > HEARTBEAT_TIMEOUT) {
      // 心跳超时
      if (!wasDisconnectedRef.current) {
        wasDisconnectedRef.current = true;
        useRustAgentStore.setState({ connectionStatus: "disconnected" });
        onTimeout?.();
        console.warn("[HeartbeatMonitor] Connection timeout, no heartbeat for", elapsed, "ms");
      }
    } else {
      // 连接正常
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        useRustAgentStore.setState({ connectionStatus: "connected" });
        onReconnect?.();
        console.log("[HeartbeatMonitor] Connection restored");
      }
    }
  }, [lastHeartbeat, onTimeout, onReconnect]);
  
  // 启动/停止监控
  useEffect(() => {
    if (!enabled) return;
    
    // 只在 running 状态下监控
    if (status !== "running") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // 重置状态
      wasDisconnectedRef.current = false;
      return;
    }
    
    // 启动定时检查
    timerRef.current = setInterval(checkHeartbeat, CHECK_INTERVAL);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, enabled, checkHeartbeat]);
  
  return {
    /** 最后心跳时间 */
    lastHeartbeat,
    /** 连接状态 */
    connectionStatus,
    /** 是否已断连 */
    isDisconnected: connectionStatus === "disconnected",
    /** 距离上次心跳的时间（毫秒） */
    timeSinceLastHeartbeat: lastHeartbeat ? Date.now() - lastHeartbeat : null,
  };
}
