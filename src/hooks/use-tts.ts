"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * TTS Hook — 优先使用豆包 TTS API，降级到浏览器原生 TTS
 * 豆包 TTS：高质量中文语音，通过 /api/tts 服务端代理
 * 浏览器 TTS：作为降级方案
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const unlockedRef = useRef(false);

  // 浏览器原生 TTS 作为降级
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [useNativeTTS, setUseNativeTTS] = useState(false);

  useEffect(() => {
    // 总是标记为支持（豆包 API 不依赖浏览器特性）
    setIsSupported(true);

    // 初始化浏览器 TTS 作为降级
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const pickVoice = () => {
        const voices = speechSynthesis.getVoices();
        const zhVoices = voices.filter(
          (v) => v.lang.startsWith("zh") || v.lang.startsWith("cmn")
        );
        const preferred = zhVoices.find(
          (v) =>
            v.name.includes("Google") ||
            v.name.includes("Microsoft") ||
            v.name.includes("Ting-Ting")
        );
        voiceRef.current = preferred || zhVoices[0] || voices[0] || null;
      };
      pickVoice();
      speechSynthesis.addEventListener("voiceschanged", pickVoice);
      return () => speechSynthesis.removeEventListener("voiceschanged", pickVoice);
    }
  }, []);

  // 获取或创建 AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // iOS/移动端音频解锁
  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    try {
      const ctx = getAudioContext();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      // 同时解锁浏览器 TTS
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        speechSynthesis.speak(u);
      }
      unlockedRef.current = true;
    } catch {
      // 静默失败
    }
  }, [getAudioContext]);

  // 通过豆包 API 播放文本
  const playViaAPI = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn("TTS API returned", res.status);
          return false;
        }

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength === 0) return false;

        const ctx = getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        return new Promise<boolean>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentSourceRef.current = source;

          source.onended = () => {
            currentSourceRef.current = null;
            resolve(true);
          };

          source.start(0);
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return false;
        console.warn("TTS API playback failed:", error);
        return false;
      }
    },
    [getAudioContext]
  );

  // 通过浏览器原生 TTS 播放
  const playViaNative = useCallback(
    (text: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        utterance.rate = 1.0;
        if (voiceRef.current) utterance.voice = voiceRef.current;

        utterance.onend = () => resolve(true);
        utterance.onerror = (e) => {
          if (e.error !== "interrupted") console.warn("Native TTS error:", e.error);
          resolve(false);
        };

        speechSynthesis.speak(utterance);
      });
    },
    []
  );

  // 播放队列中下一句
  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      playingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    const text = queueRef.current.shift()!;

    // 优先豆包 API，失败则降级到浏览器 TTS
    let success = false;
    if (!useNativeTTS) {
      success = await playViaAPI(text);
      if (!success && !abortControllerRef.current?.signal.aborted) {
        // API 失败，切换到原生并标记
        console.log("Falling back to native TTS");
        setUseNativeTTS(true);
        success = await playViaNative(text);
      }
    } else {
      success = await playViaNative(text);
    }

    // 继续播放队列中的下一句
    if (playingRef.current) {
      playNext();
    }
  }, [playViaAPI, playViaNative, useNativeTTS]);

  // 播放单段文本
  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      queueRef.current.push(text);
      if (!playingRef.current) {
        playingRef.current = true;
        setIsSpeaking(true);
        playNext();
      }
    },
    [playNext]
  );

  // 播放多段文本
  const speakSegments = useCallback(
    (segments: string[]) => {
      const valid = segments.filter((s) => s.trim());
      if (valid.length === 0) return;
      queueRef.current.push(...valid);
      if (!playingRef.current) {
        playingRef.current = true;
        setIsSpeaking(true);
        playNext();
      }
    },
    [playNext]
  );

  // 停止播放
  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;

    // 停止 API 请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 停止当前 AudioContext 播放
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // 可能已停止
      }
      currentSourceRef.current = null;
    }

    // 停止浏览器 TTS
    if (typeof window !== "undefined" && window.speechSynthesis) {
      speechSynthesis.cancel();
    }

    setIsSpeaking(false);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch { /* */ }
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    speak,
    speakSegments,
    stop,
    isSpeaking,
    isSupported,
    unlock,
  };
}
