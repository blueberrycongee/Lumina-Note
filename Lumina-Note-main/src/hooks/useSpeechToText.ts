import { useEffect, useRef, useState, useCallback } from "react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";

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
  const { t } = useLocaleStore();

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
        alert(t.speech.permissionRequired);
      } else if (reason === "audio-capture") {
        alert(t.speech.noMic);
      } else if (reason === "network") {
        alert(t.speech.networkRequired);
      }
      reportOperationError({
        source: "useSpeechToText.recognition.onerror",
        action: "Handle speech recognition error",
        error: reason || event,
        level: "warning",
      });
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
      reportOperationError({
        source: "useSpeechToText.ensureMicPermission",
        action: "Request microphone permission",
        error: err,
        level: "warning",
      });
      alert(t.speech.permissionDenied);
      return false;
    }
  }, [t.speech.permissionDenied]);

  const toggleRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (isMacSpeechBlockedInDev()) {
      alert(t.speech.macDevWarning);
      return;
    }
    if (!recognition) {
      alert(t.speech.unsupported);
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
        reportOperationError({
          source: "useSpeechToText.toggleRecording",
          action: "Start speech recognition",
          error: e,
        });
        setIsRecording(false);
      }
    }
  }, [isRecording, clearSilenceTimer, resetSilenceTimer, ensureMicPermission]);

  return { isRecording, interimText, toggleRecording };
}
