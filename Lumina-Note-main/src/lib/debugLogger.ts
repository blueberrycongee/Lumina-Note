/**
 * Debug Logger - 收集前端日志到文件
 */

import { invoke } from "@tauri-apps/api/core";

// 日志缓冲区
const logBuffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// 保存原始 console 方法
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

// 格式化日志
function formatLog(level: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  return `[${timestamp}] [${level}] ${message}`;
}

// 写入日志到文件
async function flushLogs() {
  if (logBuffer.length === 0) return;
  
  const logs = logBuffer.splice(0, logBuffer.length);
  const content = logs.join('\n') + '\n';
  
  try {
    await invoke('append_debug_log', { content });
  } catch (e) {
    originalConsole.error('[DebugLogger] Failed to write logs:', e);
  }
}

// 添加日志到缓冲区
function addLog(level: string, args: unknown[]) {
  const formatted = formatLog(level, args);
  logBuffer.push(formatted);
  
  // 延迟刷新，避免太频繁写入
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushLogs, 100);
}

// 是否启用
let enabled = false;

/**
 * 启用日志收集
 */
export function enableDebugLogger() {
  if (enabled) return;
  enabled = true;
  
  console.log = (...args) => {
    originalConsole.log(...args);
    addLog('LOG', args);
  };
  
  console.warn = (...args) => {
    originalConsole.warn(...args);
    addLog('WARN', args);
  };
  
  console.error = (...args) => {
    originalConsole.error(...args);
    addLog('ERROR', args);
  };
  
  console.info = (...args) => {
    originalConsole.info(...args);
    addLog('INFO', args);
  };
  
  originalConsole.log('[DebugLogger] Enabled - logs will be written to debug-logs/');
}

/**
 * 禁用日志收集
 */
export function disableDebugLogger() {
  if (!enabled) return;
  enabled = false;
  
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  
  // 刷新剩余日志
  flushLogs();
  
  originalConsole.log('[DebugLogger] Disabled');
}

/**
 * 手动刷新日志
 */
export function flushDebugLogs() {
  return flushLogs();
}

/**
 * 获取日志目录路径
 */
export async function getDebugLogPath(): Promise<string> {
  try {
    const path = await invoke<string>("get_debug_log_path");
    return path;
  } catch (e) {
    console.error("Failed to get log path:", e);
    return "";
  }
}

// 暴露到全局，方便在控制台调用
if (typeof window !== "undefined") {
  (window as unknown as { getDebugLogPath: typeof getDebugLogPath }).getDebugLogPath = getDebugLogPath;
}
