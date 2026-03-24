"use client";
import { useMemo } from "react";
import { useBrowserVoiceChat, type VoiceState } from "./use-browser-voice-chat";
import type { ChatMessage } from "./use-chat";
import { getRequestedVoiceProvider, getVoiceProviderLabel } from "@/lib/voice/provider";
import { useDoubaoRealtimeVoice } from "./use-doubao-realtime-voice";

export type { VoiceState };

interface UseVoiceChatOptions {
  sessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => void;
  appendMessage: (message: Omit<ChatMessage, "id">) => void;
}

export function useVoiceChat({
  sessionId,
  messages,
  isStreaming,
  sendMessage,
  appendMessage,
}: UseVoiceChatOptions) {
  const requestedProvider = useMemo(() => getRequestedVoiceProvider(), []);
  const browserVoice = useBrowserVoiceChat({ messages, isStreaming, sendMessage });
  const realtimeVoice = useDoubaoRealtimeVoice({
    enabled: requestedProvider === "doubao-realtime",
    sessionId,
    messages,
    appendMessage,
  });

  console.log("[xiaojingzi-voice] provider:", requestedProvider, "canUseRealtime:", realtimeVoice.canUseRealtime, "isVoiceSupported(realtime):", realtimeVoice.isVoiceSupported, "isVoiceSupported(browser):", browserVoice.isVoiceSupported, "fallback:", realtimeVoice.fallbackReason);

  if (requestedProvider === "doubao-realtime" && realtimeVoice.canUseRealtime) {
    return {
      ...realtimeVoice,
      requestedProvider,
      activeProvider: "doubao-realtime" as const,
      providerLabel: realtimeVoice.providerLabel,
      fallbackReason: null,
    };
  }

  return {
    ...browserVoice,
    requestedProvider,
    activeProvider: "browser-assist" as const,
    providerLabel: getVoiceProviderLabel("browser-assist"),
    fallbackReason:
      requestedProvider === "doubao-realtime"
        ? realtimeVoice.fallbackReason ||
          "豆包端到端实时语音仍在准备中，当前使用浏览器识别 + 豆包 TTS 作为兼容链路。"
        : null,
  };
}
