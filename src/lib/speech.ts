/**
 * Android 原生语音识别接口
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface SpeechResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * 开始语音识别
 * @returns Promise<SpeechResult> 识别结果
 */
export async function startListening(): Promise<SpeechResult> {
  try {
    const result = await invoke<SpeechResult>('plugin:speech|start_listening');
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 停止语音识别（等待结果）
 */
export async function stopListening(): Promise<SpeechResult> {
  try {
    const result = await invoke<SpeechResult>('plugin:speech|stop_listening');
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 取消语音识别（不等待结果）
 */
export async function cancelListening(): Promise<SpeechResult> {
  try {
    const result = await invoke<SpeechResult>('plugin:speech|cancel_listening');
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 监听实时识别结果
 * @param callback 回调函数，接收部分识别文本
 * @returns 取消监听函数
 */
export async function onPartialResult(
  callback: (text: string) => void
): Promise<UnlistenFn> {
  return listen<{ text: string }>('speech_partial', (event) => {
    callback(event.payload.text);
  });
}

/**
 * 监听语音识别就绪事件
 * @param callback 回调函数
 * @returns 取消监听函数
 */
export async function onSpeechReady(
  callback: () => void
): Promise<UnlistenFn> {
  return listen('speech_ready', () => {
    callback();
  });
}

/**
 * 检查是否在支持原生语音识别的平台
 */
export function isNativeSpeechAvailable(): boolean {
  // 检查是否在 Tauri 环境且是 Android
  return typeof window !== 'undefined' && 
         '__TAURI_INTERNALS__' in window &&
         /android/i.test(navigator.userAgent);
}
