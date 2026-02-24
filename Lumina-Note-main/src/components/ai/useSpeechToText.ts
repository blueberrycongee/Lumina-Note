import { useEffect, useRef, useState, useCallback } from "react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";

/**
 * 简单的语音转文字 Hook，基于 Web Speech API。
 * 通过 appendText 回调把识别到的文本交给调用方。
 */
export function useSpeechToText(appendText: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const { t } = useLocaleStore();

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
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (text) appendText(text);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [appendText]);

  const toggleRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert(t.speech.unsupported);
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        recognition.start();
        setIsRecording(true);
      } catch (e) {
        reportOperationError({
          source: "components.ai.useSpeechToText.toggleRecording",
          action: "Start speech recognition",
          error: e,
        });
        setIsRecording(false);
      }
    }
  }, [isRecording, t.speech.unsupported]);

  return { isRecording, toggleRecording };
}
