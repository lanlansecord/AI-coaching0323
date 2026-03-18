"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * TTS Hook — 优先使用豆包 TTS API，降级到浏览器原生 TTS
 *
 * 修复：
 * - useNativeTTS 改用 ref，避免 playNext 递归调用时闭包过期
 * - playNext 通过 ref 自引用，确保递归始终调用最新版本
 * - speak/speakSegments 不依赖 playNext 函数标识，稳定回调
 * - 增加 safety timeout 防止音频播放卡死
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

  // 用 ref 代替 state，避免递归闭包过期
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const useNativeTTSRef = useRef(false);

  // playNext 自引用 ref — 递归调用始终用最新版
  const playNextRef = useRef<(() => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    setIsSupported(true);

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

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    try {
      const ctx = getAudioContext();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
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

  // 通过豆包 API 播放
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
          if (!playingRef.current) {
            resolve(false);
            return;
          }

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentSourceRef.current = source;

          // Safety timeout: 60 秒
          const safetyTimeout = setTimeout(() => {
            if (currentSourceRef.current === source) {
              try { source.stop(); } catch { /* */ }
              currentSourceRef.current = null;
              resolve(true);
            }
          }, 60000);

          source.onended = () => {
            clearTimeout(safetyTimeout);
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

        const safetyTimeout = setTimeout(() => {
          speechSynthesis.cancel();
          resolve(true);
        }, 30000);

        utterance.onend = () => {
          clearTimeout(safetyTimeout);
          resolve(true);
        };
        utterance.onerror = (e) => {
          clearTimeout(safetyTimeout);
          if (e.error !== "interrupted") console.warn("Native TTS error:", e.error);
          resolve(false);
        };

        speechSynthesis.speak(utterance);
      });
    },
    []
  );

  // 播放队列下一句
  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      playingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    const text = queueRef.current.shift()!;

    let success = false;
    // 用 ref 读 fallback 标记，不受闭包过期影响
    if (!useNativeTTSRef.current) {
      success = await playViaAPI(text);
      if (!success && !abortControllerRef.current?.signal.aborted) {
        console.log("Falling back to native TTS");
        useNativeTTSRef.current = true;
        success = await playViaNative(text);
      }
    } else {
      success = await playViaNative(text);
    }

    // 通过 ref 递归调用最新版本，避免闭包过期
    if (playingRef.current) {
      playNextRef.current?.();
    }
  }, [playViaAPI, playViaNative]);

  // 保持 ref 同步
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // speak / speakSegments 通过 ref 启动，函数标识稳定
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    queueRef.current.push(text);
    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);
      playNextRef.current?.();
    }
  }, []);

  const speakSegments = useCallback((segments: string[]) => {
    const valid = segments.filter((s) => s.trim());
    if (valid.length === 0) return;
    queueRef.current.push(...valid);
    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);
      playNextRef.current?.();
    }
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* */ }
      currentSourceRef.current = null;
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      speechSynthesis.cancel();
    }

    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      queueRef.current = [];
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

  return { speak, speakSegments, stop, isSpeaking, isSupported, unlock };
}
