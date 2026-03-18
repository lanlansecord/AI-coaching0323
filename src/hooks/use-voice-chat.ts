"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useSpeech } from "./use-speech";
import { useTTS } from "./use-tts";
import type { ChatMessage } from "./use-chat";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface UseVoiceChatOptions {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => void;
}

/**
 * 语音对话编排器
 * 状态机：idle → listening → thinking → speaking → listening（循环）
 *
 * 修复：
 * - handleSpeechResult 用 ref 引用 speech/sendMessage，避免闭包过期
 * - 增加卡死状态超时恢复（thinking 超时 30s 自动回 listening）
 * - tts.speak 用稳定回调（ref），不再触发 useEffect 过度执行
 * - 渐进式 TTS 更健壮的句子检测
 */
export function useVoiceChat({ messages, isStreaming, sendMessage }: UseVoiceChatOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [displayText, setDisplayText] = useState("");

  const accumulatedTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const ttsQueuedUpToRef = useRef(0);
  const voiceStartTimeRef = useRef(0);
  const turnCountRef = useRef(0);
  const interruptCountRef = useRef(0);
  const firstResponseTimeRef = useRef(0);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用 ref 保存回调，避免 handleSpeechResult 闭包过期
  const sendMessageRef = useRef(sendMessage);
  const speechRef = useRef<ReturnType<typeof useSpeech>>(null!);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // 同步 voiceState ref
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // STT 回调 — 通过 ref 引用其他 hook，永不过期
  const handleSpeechResult = useCallback((text: string) => {
    if (voiceStateRef.current !== "listening") return;

    accumulatedTextRef.current += text;
    setCurrentTranscript(accumulatedTextRef.current);

    // 重置静默计时器
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const finalText = accumulatedTextRef.current.trim();
      if (finalText && voiceStateRef.current === "listening") {
        speechRef.current?.stopListening();
        accumulatedTextRef.current = "";
        setVoiceState("thinking");
        setDisplayText(finalText);
        setCurrentTranscript("");
        turnCountRef.current += 1;
        firstResponseTimeRef.current = Date.now();
        sendMessageRef.current(finalText);
      }
    }, 1500);
  }, []); // 空依赖 — 全通过 ref 引用

  const speech = useSpeech(handleSpeechResult);
  const tts = useTTS();

  // 保持 speechRef 同步
  useEffect(() => {
    speechRef.current = speech;
  });

  // STT 自动重启：listening 状态下 STT 停了就重启
  useEffect(() => {
    if (voiceState === "listening" && !speech.isListening) {
      const timer = setTimeout(() => {
        if (voiceStateRef.current === "listening") {
          speech.startListening();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [voiceState, speech.isListening, speech.startListening]);

  // 卡死状态恢复：thinking 超过 30s 自动回 listening
  useEffect(() => {
    if (voiceState === "thinking") {
      stuckTimerRef.current = setTimeout(() => {
        if (voiceStateRef.current === "thinking") {
          console.warn("Voice chat stuck in thinking, recovering...");
          setVoiceState("listening");
          setDisplayText("");
          ttsQueuedUpToRef.current = 0;
          speech.startListening();
        }
      }, 30000);
      return () => {
        if (stuckTimerRef.current) {
          clearTimeout(stuckTimerRef.current);
          stuckTimerRef.current = null;
        }
      };
    }
  }, [voiceState, speech.startListening]);

  // 渐进式 TTS：监听 AI 流式回复，检测完整句子立即播放
  useEffect(() => {
    if (voiceState !== "thinking" && voiceState !== "speaking") return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;

    const fullContent = lastAssistant.content;
    const unprocessed = fullContent.slice(ttsQueuedUpToRef.current);
    if (!unprocessed) return;

    // 按中文/英文句子结束符分割
    const sentenceEnds = /([。！？\n.!?])/g;
    let match;
    let lastEnd = 0;
    const newSentences: string[] = [];

    while ((match = sentenceEnds.exec(unprocessed)) !== null) {
      const sentence = unprocessed.slice(lastEnd, match.index + 1).trim();
      if (sentence) {
        newSentences.push(sentence);
      }
      lastEnd = match.index + 1;
    }

    if (newSentences.length > 0) {
      for (const sentence of newSentences) {
        tts.speak(sentence);
      }
      ttsQueuedUpToRef.current += lastEnd;

      if (voiceState === "thinking") {
        setVoiceState("speaking");
      }
    }

    // 更新显示文本
    setDisplayText(fullContent);
  }, [voiceState, messages, tts.speak]);

  // 流式结束后：播放剩余文本
  useEffect(() => {
    if (voiceState !== "thinking" && voiceState !== "speaking") return;
    if (isStreaming) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;

    const remaining = lastAssistant.content.slice(ttsQueuedUpToRef.current).trim();
    if (remaining) {
      tts.speak(remaining);
      ttsQueuedUpToRef.current = lastAssistant.content.length;
    }

    if (voiceState === "thinking") {
      setVoiceState("speaking");
    }
  }, [isStreaming, voiceState, messages, tts.speak]);

  // TTS 播完 → 回到 listening
  useEffect(() => {
    if (voiceState === "speaking" && !tts.isSpeaking && !isStreaming) {
      // 延迟避免 TTS 尾音被 STT 拾取
      const timer = setTimeout(() => {
        if (voiceStateRef.current === "speaking") {
          setVoiceState("listening");
          setDisplayText("");
          ttsQueuedUpToRef.current = 0;
          speech.startListening();
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [voiceState, tts.isSpeaking, isStreaming, speech.startListening]);

  // 进入语音模式
  const enterVoiceMode = useCallback(() => {
    tts.unlock();
    accumulatedTextRef.current = "";
    ttsQueuedUpToRef.current = 0;
    voiceStartTimeRef.current = Date.now();
    turnCountRef.current = 0;
    interruptCountRef.current = 0;
    firstResponseTimeRef.current = 0;
    setCurrentTranscript("");
    setDisplayText("");
    setVoiceState("listening");
    speech.startListening();
  }, [tts.unlock, speech.startListening]);

  // 退出语音模式
  const exitVoiceMode = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
    speech.stopListening();
    tts.stop();
    accumulatedTextRef.current = "";
    ttsQueuedUpToRef.current = 0;
    setVoiceState("idle");
    setCurrentTranscript("");
    setDisplayText("");
  }, [speech.stopListening, tts.stop]);

  // 打断：speaking 状态下点击光球
  const interrupt = useCallback(() => {
    if (voiceStateRef.current === "speaking") {
      tts.stop();
      ttsQueuedUpToRef.current = 0;
      interruptCountRef.current += 1;
      setVoiceState("listening");
      setDisplayText("");
      speech.startListening();
    }
  }, [tts.stop, speech.startListening]);

  const getVoiceStats = useCallback(() => ({
    voiceDurationMs: voiceStartTimeRef.current
      ? Date.now() - voiceStartTimeRef.current
      : 0,
    voiceTurnCount: turnCountRef.current,
    interruptCount: interruptCountRef.current,
    firstResponseLatencyMs: firstResponseTimeRef.current
      ? firstResponseTimeRef.current - voiceStartTimeRef.current
      : 0,
  }), []);

  return {
    voiceState,
    currentTranscript,
    displayText,
    interim: speech.interim,
    isVoiceSupported: speech.isSupported && tts.isSupported,
    enterVoiceMode,
    exitVoiceMode,
    interrupt,
    getVoiceStats,
  };
}
