"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * TTS Hook — 包装 Web Speech Synthesis API
 * 支持中文语音选择、iOS 兼容、分句播放
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const unlockedRef = useRef(false);
  const iosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);

  // 初始化：检测支持 + 选择中文语音
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    setIsSupported(true);

    const pickVoice = () => {
      const voices = speechSynthesis.getVoices();
      // 优先选中文语音，偏好名称包含 "Google" 或 "Microsoft" 的高质量语音
      const zhVoices = voices.filter(
        (v) => v.lang.startsWith("zh") || v.lang.startsWith("cmn")
      );
      const preferred = zhVoices.find(
        (v) =>
          v.name.includes("Google") ||
          v.name.includes("Microsoft") ||
          v.name.includes("Ting-Ting") ||
          v.name.includes("Meijia")
      );
      voiceRef.current = preferred || zhVoices[0] || voices[0] || null;
    };

    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", pickVoice);
    };
  }, []);

  // iOS 兼容：用户交互时调用解锁音频
  const unlock = useCallback(() => {
    if (unlockedRef.current || typeof window === "undefined") return;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    speechSynthesis.speak(u);
    unlockedRef.current = true;
  }, []);

  // iOS 15s 暂停 bug：speaking 期间定时 pause/resume
  const startIOSKeepAlive = useCallback(() => {
    if (iosTimerRef.current) return;
    const isIOS =
      typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!isIOS) return;
    iosTimerRef.current = setInterval(() => {
      if (speechSynthesis.speaking) {
        speechSynthesis.pause();
        speechSynthesis.resume();
      }
    }, 10000);
  }, []);

  const stopIOSKeepAlive = useCallback(() => {
    if (iosTimerRef.current) {
      clearInterval(iosTimerRef.current);
      iosTimerRef.current = null;
    }
  }, []);

  // 播放队列中下一句
  const playNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      playingRef.current = false;
      setIsSpeaking(false);
      stopIOSKeepAlive();
      return;
    }

    const text = queueRef.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }

    utterance.onend = () => {
      playNext();
    };
    utterance.onerror = (e) => {
      // 忽略 interrupted 错误（用户主动打断）
      if (e.error !== "interrupted") {
        console.warn("TTS error:", e.error);
      }
      playNext();
    };

    speechSynthesis.speak(utterance);
  }, [stopIOSKeepAlive]);

  // 播放单段文本
  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      queueRef.current.push(text);
      if (!playingRef.current) {
        playingRef.current = true;
        setIsSpeaking(true);
        startIOSKeepAlive();
        playNext();
      }
    },
    [playNext, startIOSKeepAlive]
  );

  // 播放多段文本（分句）
  const speakSegments = useCallback(
    (segments: string[]) => {
      const valid = segments.filter((s) => s.trim());
      if (valid.length === 0) return;
      queueRef.current.push(...valid);
      if (!playingRef.current) {
        playingRef.current = true;
        setIsSpeaking(true);
        startIOSKeepAlive();
        playNext();
      }
    },
    [playNext, startIOSKeepAlive]
  );

  // 停止播放
  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    speechSynthesis.cancel();
    setIsSpeaking(false);
    stopIOSKeepAlive();
  }, [stopIOSKeepAlive]);

  // 清理
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      stopIOSKeepAlive();
    };
  }, [stopIOSKeepAlive]);

  return {
    speak,
    speakSegments,
    stop,
    isSpeaking,
    isSupported,
    unlock,
  };
}
