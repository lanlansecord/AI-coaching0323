"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useSpeech } from "./use-speech";
import { useTTS } from "./use-tts";
import { useAudioLevel } from "./use-audio-level";
import type { ChatMessage } from "./use-chat";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface UseVoiceChatOptions {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => void;
}

/**
 * 语音对话编排器 v2
 * 新增：
 * - 音量检测 + 音量响应式光球
 * - 进入语音模式时自动播放最近 AI 消息作为欢迎语
 * - 轮次计数暴露给 UI
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
  const [turnCount, setTurnCount] = useState(0);
  const interruptCountRef = useRef(0);
  const firstResponseTimeRef = useRef(0);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingPlayedRef = useRef(false);

  const sendMessageRef = useRef(sendMessage);
  const speechRef = useRef<ReturnType<typeof useSpeech>>(null!);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // STT 回调
  const handleSpeechResult = useCallback((text: string) => {
    if (voiceStateRef.current !== "listening") return;

    accumulatedTextRef.current += text;
    setCurrentTranscript(accumulatedTextRef.current);

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const finalText = accumulatedTextRef.current.trim();
      if (finalText && voiceStateRef.current === "listening") {
        speechRef.current?.stopListening();
        audioLevelHook.stop();
        accumulatedTextRef.current = "";
        setVoiceState("thinking");
        setDisplayText(finalText);
        setCurrentTranscript("");
        turnCountRef.current += 1;
        setTurnCount(turnCountRef.current);
        firstResponseTimeRef.current = Date.now();
        sendMessageRef.current(finalText);
      }
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speech = useSpeech(handleSpeechResult);
  const tts = useTTS();
  const audioLevelHook = useAudioLevel(0.03, 800);

  useEffect(() => {
    speechRef.current = speech;
  });

  // STT 自动重启
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

  // 音量检测同步：listening 时开始，其他状态停止
  useEffect(() => {
    if (voiceState === "listening") {
      if (!audioLevelHook.isActive) {
        audioLevelHook.start();
      }
    } else {
      if (audioLevelHook.isActive) {
        audioLevelHook.stop();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  // 卡死恢复
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

  // 渐进式 TTS
  useEffect(() => {
    if (voiceState !== "thinking" && voiceState !== "speaking") return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;

    const fullContent = lastAssistant.content;
    const unprocessed = fullContent.slice(ttsQueuedUpToRef.current);
    if (!unprocessed) return;

    const sentenceEnds = /([。！？\n.!?，,；;：:])/g;
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

    setDisplayText(fullContent);
  }, [voiceState, messages, tts.speak]);

  // 流式结束后播放剩余
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

  // TTS 播完 → listening
  useEffect(() => {
    if (voiceState === "speaking" && !tts.isSpeaking && !isStreaming) {
      const timer = setTimeout(() => {
        if (voiceStateRef.current === "speaking") {
          setVoiceState("listening");
          setDisplayText("");
          ttsQueuedUpToRef.current = 0;
          speech.startListening();
          audioLevelHook.start();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState, tts.isSpeaking, isStreaming, speech.startListening]);

  // 进入语音模式
  const enterVoiceMode = useCallback(() => {
    tts.unlock();
    accumulatedTextRef.current = "";
    ttsQueuedUpToRef.current = 0;
    voiceStartTimeRef.current = Date.now();
    turnCountRef.current = 0;
    setTurnCount(0);
    interruptCountRef.current = 0;
    firstResponseTimeRef.current = 0;
    greetingPlayedRef.current = false;
    setCurrentTranscript("");
    setDisplayText("");

    // 播放欢迎语：最近一条 AI 消息
    const lastAI = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAI?.content && !greetingPlayedRef.current) {
      greetingPlayedRef.current = true;
      setVoiceState("speaking");

      // 截取前 100 字作为欢迎语，避免太长
      const greeting = lastAI.content.length > 100
        ? lastAI.content.slice(0, 100)
        : lastAI.content;
      setDisplayText(greeting);
      tts.speak(greeting);
      ttsQueuedUpToRef.current = lastAI.content.length; // 标记全部已处理
    } else {
      setVoiceState("listening");
      speech.startListening();
      audioLevelHook.start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.unlock, speech.startListening, messages]);

  // 退出
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
    audioLevelHook.stop();
    accumulatedTextRef.current = "";
    ttsQueuedUpToRef.current = 0;
    setVoiceState("idle");
    setCurrentTranscript("");
    setDisplayText("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.stopListening, tts.stop]);

  // 打断
  const interrupt = useCallback(() => {
    if (voiceStateRef.current === "speaking") {
      tts.stop();
      ttsQueuedUpToRef.current = 0;
      interruptCountRef.current += 1;
      setVoiceState("listening");
      setDisplayText("");
      speech.startListening();
      audioLevelHook.start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    audioLevel: audioLevelHook.audioLevel,
    turnCount,
    isVoiceSupported: speech.isSupported && tts.isSupported,
    enterVoiceMode,
    exitVoiceMode,
    interrupt,
    getVoiceStats,
  };
}
