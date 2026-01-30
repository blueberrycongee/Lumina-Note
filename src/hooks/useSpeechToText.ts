import { useEffect, useRef, useState, useCallback } from "react";

type SpeechToTextOptions = {
  /** 静音自动停止时间（毫秒），默认 6000 */
  silenceDurationMs?: number;
};

const isMacSpeechBlockedInDev = () => {
  if (!import.meta.env.DEV) return false;
  if (typeof navigator === "undefined") return false;
  const isMac = /Mac/i.test(navigator.userAgent);
  const isDevServer = window.location.protocol.startsWith("http");
  return isMac && isDevServer;
};

/**
 * 语音转文字 Hook，基于 Web Speech API。
 * 支持流式显示中间结果和最终结果追加。
 */
export function useSpeechToText(
  appendText: (text: string) => void,
  options?: SpeechToTextOptions
) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState(""); // 中间结果（流式显示）
  const recognitionRef = useRef<any | null>(null);
  const appendTextRef = useRef(appendText);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceMs = options?.silenceDurationMs ?? 6000;

  // 保持 appendText 最新引用
  useEffect(() => {
    appendTextRef.current = appendText;
  }, [appendText]);

  // 清除静音计时器
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // 重置静音计时器（静音一段时间后自动停止）
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.stop();
      }
    }, silenceMs);
  }, [clearSilenceTimer, silenceMs]);

  useEffect(() => {
    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      recognitionRef.current = null;
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      // 更新中间结果（流式显示）
      setInterimText(interim);
      
      // 有说话活动时重置计时器
      resetSilenceTimer();
      
      // 最终结果追加到输入框，并清空中间结果
      if (final) {
        appendTextRef.current(final);
        setInterimText("");
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      setIsRecording(false);
      setInterimText("");
    };

    recognition.onerror = (event: any) => {
      const reason = event?.error;
      if (reason === "not-allowed" || reason === "service-not-allowed") {
        alert("语音输入需要开启麦克风和语音识别权限，请在系统设置中授权。");
      } else if (reason === "audio-capture") {
        alert("未检测到麦克风设备，请检查麦克风连接或系统设置。");
      } else if (reason === "network") {
        alert("语音识别需要联网，请检查网络连接。");
      }
      console.error("Speech recognition error:", reason || event);
      clearSilenceTimer();
      setIsRecording(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimer();
      recognition.stop();
    };
  }, [resetSilenceTimer, clearSilenceTimer]);

  const ensureMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.error("Microphone permission denied", err);
      alert("无法获取麦克风权限，请在系统设置中允许麦克风访问。");
      return false;
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (isMacSpeechBlockedInDev()) {
      alert("macOS 开发模式下语音识别会触发系统崩溃，请使用打包后的 .app 测试语音输入。");
      return;
    }
    if (!recognition) {
      alert("当前环境不支持语音输入");
      return;
    }

    if (isRecording) {
      clearSilenceTimer();
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        const ok = await ensureMicPermission();
        if (!ok) {
          setIsRecording(false);
          return;
        }
        recognition.start();
        setIsRecording(true);
        // 开始录音时启动静音计时器，如果一直没说话也会自动停止
        resetSilenceTimer();
      } catch (e) {
        console.error("Failed to start speech recognition", e);
        setIsRecording(false);
      }
    }
  }, [isRecording, clearSilenceTimer, resetSilenceTimer, ensureMicPermission]);

  return { isRecording, interimText, toggleRecording };
}
