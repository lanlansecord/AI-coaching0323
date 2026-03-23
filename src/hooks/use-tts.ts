"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * TTS Hook — 优先使用豆包 TTS API，降级到浏览器原生 TTS
 *
 * 性能优化：
 * - 预取机制：speak() 调用时立即发起 fetch，播放时直接用缓存音频
 *   原来：[fetch A] → [play A] → [fetch B] → [play B]（串行，每句多等一个网络 RTT）
 *   现在：[fetch A] → [play A + fetch B already done] → [play B]（并行，消除等待）
 * - 稳定回调：speak/stop 函数标识不变，避免触发外层 effect 重跑
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

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const useNativeTTSRef = useRef(false);
  const playNextRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // 预取缓存：text → Promise<ArrayBuffer | null>
  const audioCacheRef = useRef<Map<string, Promise<ArrayBuffer | null>>>(new Map());

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

  // 预取音频：立即发起 fetch，返回 Promise，结果缓存
  const prefetchAudio = useCallback((text: string) => {
    const existing = audioCacheRef.current.get(text);
    if (existing) return existing;

    const promise = (async (): Promise<ArrayBuffer | null> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return buf.byteLength > 0 ? buf : null;
      } catch {
        return null;
      }
    })();

    audioCacheRef.current.set(text, promise);
    return promise;
  }, []);

  // 播放 ArrayBuffer（已解码的音频）
  const playArrayBuffer = useCallback(
    async (arrayBuffer: ArrayBuffer): Promise<boolean> => {
      try {
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
        console.warn("Audio playback failed:", error);
        return false;
      }
    },
    [getAudioContext]
  );

  // 通过豆包 API 播放（无缓存时的 fallback）
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

        return playArrayBuffer(arrayBuffer);
      } catch (error) {
        if ((error as Error).name === "AbortError") return false;
        console.warn("TTS API playback failed:", error);
        return false;
      }
    },
    [playArrayBuffer]
  );

  // 浏览器原生 TTS 播放
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

  // 播放队列下一句 — 优先使用预取缓存
  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      playingRef.current = false;
      setIsSpeaking(false);
      audioCacheRef.current.clear();
      return;
    }

    const text = queueRef.current.shift()!;

    let success = false;
    if (!useNativeTTSRef.current) {
      // 优先使用预取缓存
      const cachedPromise = audioCacheRef.current.get(text);
      if (cachedPromise) {
        const arrayBuffer = await cachedPromise;
        audioCacheRef.current.delete(text);
        if (arrayBuffer && playingRef.current) {
          success = await playArrayBuffer(arrayBuffer);
        }
      }

      // 缓存没命中或播放失败 → 直接请求
      if (!success && playingRef.current) {
        success = await playViaAPI(text);
      }

      // API 彻底失败 → 降级浏览器 TTS
      if (!success && playingRef.current && !abortControllerRef.current?.signal.aborted) {
        console.log("Falling back to native TTS");
        useNativeTTSRef.current = true;
        success = await playViaNative(text);
      }
    } else {
      success = await playViaNative(text);
    }

    if (playingRef.current) {
      playNextRef.current?.();
    }
  }, [playArrayBuffer, playViaAPI, playViaNative]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // speak：推入队列 + 立即预取音频
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    queueRef.current.push(text);

    // 立即发起预取（不等播放到这句）
    if (!useNativeTTSRef.current) {
      prefetchAudio(text);
    }

    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);
      playNextRef.current?.();
    }
  }, [prefetchAudio]);

  const speakSegments = useCallback((segments: string[]) => {
    const valid = segments.filter((s) => s.trim());
    if (valid.length === 0) return;

    for (const seg of valid) {
      queueRef.current.push(seg);
      if (!useNativeTTSRef.current) {
        prefetchAudio(seg);
      }
    }

    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);
      playNextRef.current?.();
    }
  }, [prefetchAudio]);

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;

    // 清理预取缓存
    audioCacheRef.current.clear();

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
      audioCacheRef.current.clear();
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
