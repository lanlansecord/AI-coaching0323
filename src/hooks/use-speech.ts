"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

// Browser SpeechRecognition types
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface StartListeningOptions {
  continuous?: boolean;
}

export function useSpeech(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false); // ref 版本，避免闭包过期
  const onResultRef = useRef(onResult);
  const interimRef = useRef("");
  const shouldFlushOnEndRef = useRef(true);
  const stopResolveRef = useRef<(() => void) | null>(null);
  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // 保持 ref 同步
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    interimRef.current = interim;
  }, [interim]);

  const flushInterim = useCallback(() => {
    const text = interimRef.current.trim();
    if (!text) return;
    onResultRef.current(text);
    interimRef.current = "";
    setInterim("");
  }, []);

  const startListening = useCallback((options?: StartListeningOptions) => {
    // 用 ref 检查，避免闭包过期导致判断错误
    if (!isSupported || isListeningRef.current) return;

    // 清理旧实例
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* */ }
      recognitionRef.current = null;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = "zh-CN";
    recognition.continuous = options?.continuous ?? true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    shouldFlushOnEndRef.current = true;

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setInterim("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        onResultRef.current(finalText);
        interimRef.current = "";
        setInterim("");
      } else {
        interimRef.current = interimText;
        setInterim(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      // Don't stop on no-speech or aborted, let user keep trying
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setIsListening(false);
        isListeningRef.current = false;
        setInterim("");
      }
    };

    recognition.onend = () => {
      if (shouldFlushOnEndRef.current) {
        flushInterim();
      }
      recognitionRef.current = null;
      setIsListening(false);
      isListeningRef.current = false;
      setInterim("");
      stopResolveRef.current?.();
      stopResolveRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.warn("Failed to start speech recognition:", e);
      recognitionRef.current = null;
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [flushInterim, isSupported]); // 不再依赖 isListening state，用 ref 判断

  const stopListening = useCallback((options?: { flushInterim?: boolean }) => {
    shouldFlushOnEndRef.current = options?.flushInterim !== false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* */ }
    }
  }, []);

  const stopListeningAndWait = useCallback(async (options?: {
    flushInterim?: boolean;
    timeoutMs?: number;
  }) => {
    if (!recognitionRef.current || !isListeningRef.current) {
      if (options?.flushInterim !== false) {
        flushInterim();
      }
      return;
    }

    shouldFlushOnEndRef.current = options?.flushInterim !== false;

    const waitForEnd = new Promise<void>((resolve) => {
      stopResolveRef.current = resolve;
    });

    try {
      recognitionRef.current.stop();
    } catch {
      stopResolveRef.current?.();
      stopResolveRef.current = null;
      recognitionRef.current = null;
      setIsListening(false);
      isListeningRef.current = false;
      setInterim("");
      return;
    }

    await Promise.race([
      waitForEnd,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, options?.timeoutMs ?? 1200);
      }),
    ]);
  }, [flushInterim]);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isListening,
    interim,
    isSupported,
    startListening,
    stopListening,
    stopListeningAndWait,
    toggleListening,
  };
}
