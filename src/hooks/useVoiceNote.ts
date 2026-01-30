import { useState, useRef, useCallback, useEffect } from "react";
import { saveFile, exists } from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { callLLM, type Message } from "@/services/llm";

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
          console.error("Failed to restart recognition", e);
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
        alert("语音输入需要开启麦克风和语音识别权限，请在系统设置中授权。");
      } else if (event.error === "audio-capture") {
        alert("未检测到麦克风设备，请检查麦克风连接或系统设置。");
      } else if (event.error === "network") {
        alert("语音识别需要联网，请检查网络连接。");
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
    return `语音笔记_${year}-${month}-${day}_${hours}-${minutes}`;
  }, []);

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
    if (!config.apiKey && config.provider !== "ollama") {
      return "";
    }

    try {
      const messages: Message[] = [
        {
          role: "system",
          content: "你是一个专业的笔记助手。请为以下语音转录的文字生成一个简洁的总结，提取关键要点。总结应该简明扼要，使用 markdown 格式，包含要点列表。"
        },
        {
          role: "user",
          content: `请为以下语音笔记生成总结：\n\n${transcript}`
        }
      ];
      
      const response = await callLLM(messages, { temperature: 0.3 });
      return response.content || "";
    } catch (error) {
      console.error("Failed to generate summary:", error);
      return "";
    }
  }, [config]);

  // 开始录音
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

  const startRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (isMacSpeechBlockedInDev()) {
      alert("macOS 开发模式下语音识别会触发系统崩溃，请使用打包后的 .app 测试语音输入。");
      return;
    }
    if (!recognition) {
      alert("当前环境不支持语音输入");
      return;
    }

    if (!vaultPath) {
      alert("请先打开一个工作区");
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
      console.error("Failed to start speech recognition", e);
      setIsRecording(false);
      setStatus("idle");
    }
  }, [vaultPath, resetSilenceTimer, ensureMicPermission]);

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
        throw new Error("无法生成文件路径");
      }

      // 构建初始内容
      const now = new Date();
      const dateStr = now.toLocaleString("zh-CN");
      let content = `# ${fileName}\n\n`;
      content += `> 📅 创建时间：${dateStr}\n\n`;
      content += `## 原始文稿\n\n${fullTranscript}\n`;

      // 先保存原始文稿
      await saveFile(filePath, content);
      await refreshFileTree();

      // 生成 AI 总结
      setStatus("summarizing");
      const summary = await generateSummary(fullTranscript);
      
      if (summary) {
        // 追加总结到文件
        content += `\n---\n\n## AI 总结\n\n${summary}\n`;
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
      console.error("Failed to save voice note:", error);
      alert("保存语音笔记失败");
      setStatus("idle");
      setTranscriptChunks([]);
      return null;
    }
  }, [transcriptChunks, generateFileName, getUniqueFilePath, generateSummary, refreshFileTree, openFile, clearSilenceTimer]);

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
