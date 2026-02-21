import { useState, useRef, useCallback, useEffect } from "react";
import { saveFile, exists } from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { callLLM, type Message } from "@/services/llm";
import { reportOperationError } from "@/lib/reportError";

const isMacSpeechBlockedInDev = () => {
  if (!import.meta.env.DEV) return false;
  if (typeof navigator === "undefined") return false;
  const isMac = /Mac/i.test(navigator.userAgent);
  const isDevServer = window.location.protocol.startsWith("http");
  return isMac && isDevServer;
};

/**
 * 语音笔记 Hook
 * 持续录音，结束后保存为 markdown 文件并自动生成 AI 总结
 */
export function useVoiceNote() {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState(""); // 实时中间结果
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]); // 已确认的文字片段
  const [status, setStatus] = useState<"idle" | "recording" | "saving" | "summarizing">("idle");
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { vaultPath, refreshFileTree, openFile } = useFileStore();
  const { config } = useAIStore();
  const { t, locale } = useLocaleStore();

  // 清除静音计时器
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // 重置静音计时器（30秒无声音自动停止，比普通输入长）
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.stop();
      }
    }, 30000); // 30秒
  }, [clearSilenceTimer]);

  // 初始化语音识别
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
      let finalText = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      
      // 更新中间结果
      setInterimText(interim);
      
      // 有说话活动时重置计时器
      resetSilenceTimer();
      
      // 最终结果追加到文字片段
      if (finalText) {
        setTranscriptChunks(prev => [...prev, finalText]);
        setInterimText("");
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      // 如果还在录音状态，说明是意外中断，尝试重启
      if (recognitionRef.current?._shouldContinue) {
        try {
          recognition.start();
        } catch (e) {
          reportOperationError({
            source: "useVoiceNote.recognition.onend",
            action: "Restart speech recognition",
            error: e,
            level: "warning",
          });
          setIsRecording(false);
          setStatus("idle");
        }
      } else {
        setIsRecording(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      clearSilenceTimer();
      // 如果是 no-speech 错误，不停止录音
      if (event.error === "no-speech") {
        resetSilenceTimer();
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        alert(t.speech.permissionRequired);
      } else if (event.error === "audio-capture") {
        alert(t.speech.noMic);
      } else if (event.error === "network") {
        alert(t.speech.networkRequired);
      }
      setIsRecording(false);
      setStatus("idle");
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimer();
      recognition.stop();
    };
  }, [resetSilenceTimer, clearSilenceTimer]);

  // 生成文件名（基于时间戳）
  const generateFileName = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${t.file.voiceNotePrefix}_${year}-${month}-${day}_${hours}-${minutes}`;
  }, [t.file.voiceNotePrefix]);

  // 生成唯一文件路径
  const getUniqueFilePath = useCallback(async (baseName: string) => {
    if (!vaultPath) return null;
    
    const sep = vaultPath.includes("\\") ? "\\" : "/";
    let filePath = `${vaultPath}${sep}${baseName}.md`;
    let counter = 1;
    
    while (await exists(filePath)) {
      filePath = `${vaultPath}${sep}${baseName}_${counter}.md`;
      counter++;
    }
    
    return filePath;
  }, [vaultPath]);

  // 调用 AI 生成总结
  const generateSummary = useCallback(async (transcript: string): Promise<string> => {
    if (!config.apiKey && config.provider !== "ollama" && config.provider !== "custom") {
      return "";
    }

    try {
      const messages: Message[] = [
        {
          role: "system",
          content: t.speech.voiceNoteSummarySystem,
        },
        {
          role: "user",
          content: t.speech.voiceNoteSummaryUser.replace('{text}', transcript),
        }
      ];
      
      const response = await callLLM(messages, { temperature: 0.3 });
      return response.content || "";
    } catch (error) {
      reportOperationError({
        source: "useVoiceNote.generateSummary",
        action: "Generate voice note summary",
        error,
        level: "warning",
      });
      return "";
    }
  }, [config, t]);

  // 开始录音
  const ensureMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      reportOperationError({
        source: "useVoiceNote.ensureMicPermission",
        action: "Request microphone permission",
        error: err,
        level: "warning",
      });
      alert(t.speech.permissionDenied);
      return false;
    }
  }, [t.speech.permissionDenied]);

  const startRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (isMacSpeechBlockedInDev()) {
      alert(t.speech.macDevWarning);
      return;
    }
    if (!recognition) {
      alert(t.speech.unsupported);
      return;
    }

    if (!vaultPath) {
      alert(t.common.openWorkspaceFirst);
      return;
    }

    // 重置状态
    setTranscriptChunks([]);
    setInterimText("");
    setStatus("recording");
    
    try {
      const ok = await ensureMicPermission();
      if (!ok) {
        setIsRecording(false);
        setStatus("idle");
        return;
      }
      recognition._shouldContinue = true;
      recognition.start();
      setIsRecording(true);
      resetSilenceTimer();
    } catch (e) {
      reportOperationError({
        source: "useVoiceNote.startRecording",
        action: "Start speech recognition",
        error: e,
      });
      setIsRecording(false);
      setStatus("idle");
    }
  }, [vaultPath, resetSilenceTimer, ensureMicPermission, t]);

  // 停止录音并保存
  const stopRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition._shouldContinue = false;
      recognition.stop();
    }
    
    clearSilenceTimer();
    setIsRecording(false);
    
    // 合并所有文字片段
    const fullTranscript = transcriptChunks.join("");
    
    if (!fullTranscript.trim()) {
      setStatus("idle");
      setTranscriptChunks([]);
      return null;
    }

    setStatus("saving");

    try {
      // 生成文件
      const fileName = generateFileName();
      const filePath = await getUniqueFilePath(fileName);
      
      if (!filePath) {
        throw new Error(t.file.voiceNotePathFailed);
      }

      // 构建初始内容
      const now = new Date();
      const dateStr = now.toLocaleString(locale);
      let content = `# ${fileName}\n\n`;
      content += `> 📅 ${t.file.voiceNoteCreatedAtLabel}：${dateStr}\n\n`;
      content += `## ${t.file.voiceNoteTranscriptTitle}\n\n${fullTranscript}\n`;

      // 先保存原始文稿
      await saveFile(filePath, content);
      await refreshFileTree();

      // 生成 AI 总结
      setStatus("summarizing");
      const summary = await generateSummary(fullTranscript);
      
      if (summary) {
        // 追加总结到文件
        content += `\n---\n\n## ${t.file.voiceNoteSummaryTitle}\n\n${summary}\n`;
        await saveFile(filePath, content);
      }

      // 刷新文件树并打开文件
      await refreshFileTree();
      // 稍等一下确保文件树更新完成
      await new Promise(resolve => setTimeout(resolve, 100));
      openFile(filePath);
      
      setStatus("idle");
      setTranscriptChunks([]);
      
      return filePath;
    } catch (error) {
      reportOperationError({
        source: "useVoiceNote.stopRecording",
        action: "Save voice note",
        error,
        userMessage: t.file.voiceNoteSaveFailed,
      });
      setStatus("idle");
      setTranscriptChunks([]);
      return null;
    }
  }, [transcriptChunks, generateFileName, getUniqueFilePath, generateSummary, refreshFileTree, openFile, clearSilenceTimer, t, locale]);

  // 取消录音
  const cancelRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition._shouldContinue = false;
      recognition.stop();
    }
    
    clearSilenceTimer();
    setIsRecording(false);
    setStatus("idle");
    setTranscriptChunks([]);
    setInterimText("");
  }, [clearSilenceTimer]);

  // 当前已录入的文字（实时显示用）
  const currentTranscript = transcriptChunks.join("") + interimText;

  return {
    isRecording,
    status,
    interimText,
    currentTranscript,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
