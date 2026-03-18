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
 * 流程：
 * 1. enterVoiceMode() → unlock TTS, startListening, state → listening
 * 2. STT finalResult → 累积文本 + 启动 1.5s 静默计时器
 * 3. 计时器到 → stopListening, state → thinking, sendMessage(text)
 * 4. AI 流式回复 → 检测完整句子，立即 TTS 播放（渐进式）
 * 5. 流式结束 + TTS 播完 → state → listening，自动 startListening
 * 6. exitVoiceMode() → 停止一切，state → idle
 */
export function useVoiceChat({ messages, isStreaming, sendMessage }: UseVoiceChatOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [currentTranscript, setCurrentTranscript] = useState(""); // 当前识别的完整文本
  const [displayText, setDisplayText] = useState(""); // 显示的字幕文本

  const accumulatedTextRef = useRef(""); // STT 累积文本
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const lastAssistantContentRef = useRef(""); // 追踪上次已播放的 AI 内容
  const ttsQueuedUpToRef = useRef(0); // TTS 已排到的字符位置
  const voiceStartTimeRef = useRef(0);
  const turnCountRef = useRef(0);
  const interruptCountRef = useRef(0);
  const firstResponseTimeRef = useRef(0);

  // 同步 ref
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // STT 回调：收到最终识别结果
  const handleSpeechResult = useCallback((text: string) => {
    if (voiceStateRef.current !== "listening") return;

    accumulatedTextRef.current += text;
    setCurrentTranscript(accumulatedTextRef.current);

    // 重置静默计时器
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const finalText = accumulatedTextRef.current.trim();
      if (finalText && voiceStateRef.current === "listening") {
        // 停止听 → 发送消息
        speech.stopListening();
        accumulatedTextRef.current = "";
        setVoiceState("thinking");
        setDisplayText(finalText);
        setCurrentTranscript("");
        turnCountRef.current += 1;
        firstResponseTimeRef.current = Date.now();
        sendMessage(finalText);
      }
    }, 1500);
  }, [sendMessage]);

  const speech = useSpeech(handleSpeechResult);
  const tts = useTTS();

  // STT 自动重启：listening 状态下如果 STT 自己停了，重新启动
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

  // 渐进式 TTS：监听 AI 流式回复，检测完整句子立即播放
  useEffect(() => {
    if (voiceState !== "thinking" && voiceState !== "speaking") return;

    // 找到最后一条 assistant 消息
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const fullContent = lastAssistant.content;
    if (!fullContent) return;

    // 检测新的完整句子
    const unprocessed = fullContent.slice(ttsQueuedUpToRef.current);
    // 按中文句子结束符分割
    const sentenceEnds = /([。！？\n])/g;
    let match;
    let lastEnd = 0;

    while ((match = sentenceEnds.exec(unprocessed)) !== null) {
      const sentence = unprocessed.slice(lastEnd, match.index + 1).trim();
      if (sentence) {
        tts.speak(sentence);
        if (voiceState === "thinking") {
          setVoiceState("speaking");
        }
      }
      lastEnd = match.index + 1;
    }

    if (lastEnd > 0) {
      ttsQueuedUpToRef.current += lastEnd;
    }

    // 更新显示文本
    setDisplayText(fullContent);
  }, [voiceState, messages, tts.speak]);

  // 流式结束后：播放剩余文本
  useEffect(() => {
    if (voiceState !== "thinking" && voiceState !== "speaking") return;
    if (isStreaming) return; // 还在流式中，等待

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
      // 延迟一点再开始听，避免 TTS 尾音被 STT 拾取
      const timer = setTimeout(() => {
        if (voiceStateRef.current === "speaking") {
          setVoiceState("listening");
          setDisplayText("");
          ttsQueuedUpToRef.current = 0;
          speech.startListening();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [voiceState, tts.isSpeaking, isStreaming, speech.startListening]);

  // 进入语音模式
  const enterVoiceMode = useCallback(() => {
    tts.unlock();
    accumulatedTextRef.current = "";
    ttsQueuedUpToRef.current = 0;
    lastAssistantContentRef.current = "";
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
    if (voiceState === "speaking") {
      tts.stop();
      ttsQueuedUpToRef.current = 0;
      interruptCountRef.current += 1;
      setVoiceState("listening");
      setDisplayText("");
      speech.startListening();
    }
  }, [voiceState, tts.stop, speech.startListening]);

  // 获取语音统计数据
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
