"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IRTCEngine, MediaType as RtcMediaType } from "@volcengine/rtc";
import type { ChatMessage } from "./use-chat";
import { getVoiceProviderLabel } from "@/lib/voice/provider";
import type { VoiceState } from "./use-browser-voice-chat";
import type { RealtimeSessionConnection } from "@/lib/voice/volc-realtime";

interface RealtimeConfigState {
  ready: boolean;
  reason: string | null;
}

interface UseDoubaoRealtimeVoiceOptions {
  enabled: boolean;
  sessionId: string | null;
  messages: ChatMessage[];
  appendMessage: (message: Omit<ChatMessage, "id">) => void;
}

async function persistVoiceMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  const trimmed = content.trim();
  if (!trimmed) return;

  await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role,
      content: trimmed,
      inputMode: "voice",
    }),
  });
}

export function useDoubaoRealtimeVoice({
  enabled,
  sessionId,
  messages,
  appendMessage,
}: UseDoubaoRealtimeVoiceOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [turnCount, setTurnCount] = useState(0);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [configState, setConfigState] = useState<RealtimeConfigState>({
    ready: false,
    reason: null,
  });
  const [isCheckingConfig, setIsCheckingConfig] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);

  const engineRef = useRef<{
    engine: IRTCEngine;
    rtc: {
      destroyEngine: (engine: IRTCEngine) => void;
      MediaType: { AUDIO: RtcMediaType };
      StreamIndex: { STREAM_INDEX_MAIN: unknown };
      events: Record<string, string>;
      SUBTITLE_MODE: { ASR_ONLY: unknown };
      SubtitleEventType: { ERROR: number };
    };
  } | null>(null);
  const connectionRef = useRef<RealtimeSessionConnection | null>(null);
  const voiceStartTimeRef = useRef(0);
  const interruptCountRef = useRef(0);
  const firstResponseLatencyRef = useRef(0);
  const persistedKeysRef = useRef<Set<string>>(new Set());
  const botSpokeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setConfigState({ ready: false, reason: null });
      setFallbackReason(null);
      return;
    }

    let disposed = false;
    setIsCheckingConfig(true);

    fetch("/api/voice/realtime/config")
      .then((res) => res.json())
      .then((data: { ready?: boolean; reason?: string | null }) => {
        if (disposed) return;
        const ready = !!data.ready;
        const reason = ready ? null : data.reason || "豆包实时语音尚未完成配置";
        setConfigState({ ready, reason });
        setFallbackReason(reason);
      })
      .catch(() => {
        if (disposed) return;
        const reason = "豆包实时语音配置检查失败，已回退到兼容语音模式";
        setConfigState({ ready: false, reason });
        setFallbackReason(reason);
      })
      .finally(() => {
        if (!disposed) {
          setIsCheckingConfig(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [enabled]);

  useEffect(() => {
    setIsVoiceSupported(
      enabled &&
        configState.ready &&
        typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, [enabled, configState.ready]);

  const cleanupRtc = useCallback(async () => {
    const rtcState = engineRef.current;
    engineRef.current = null;

    if (!rtcState) return;

    try {
      rtcState.engine.stopSubtitle?.();
    } catch {
      // ignore
    }

    try {
      await rtcState.engine.unpublishStream(rtcState.rtc.MediaType.AUDIO);
    } catch {
      // ignore
    }

    try {
      await rtcState.engine.stopAudioCapture();
    } catch {
      // ignore
    }

    try {
      await rtcState.engine.leaveRoom();
    } catch {
      // ignore
    }

    try {
      rtcState.rtc.destroyEngine(rtcState.engine);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      void cleanupRtc();
    };
  }, [cleanupRtc]);

  const persistSubtitle = useCallback(
    async (role: "user" | "assistant", text: string, key: string) => {
      if (!sessionId || persistedKeysRef.current.has(key)) return;
      persistedKeysRef.current.add(key);

      appendMessage({ role, content: text });

      try {
        await persistVoiceMessage(sessionId, role, text);
      } catch {
        // 语音模式下优先保证对话不断，落库失败不打断
      }
    },
    [appendMessage, sessionId]
  );

  const enterVoiceMode = useCallback(async () => {
    if (!enabled || !configState.ready || !sessionId) {
      return;
    }

    setVoiceState("thinking");
    setCurrentTranscript("");
    setDisplayText(
      messages.at(-1)?.role === "assistant" ? messages.at(-1)?.content || "" : ""
    );
    setTurnCount(0);
    interruptCountRef.current = 0;
    firstResponseLatencyRef.current = 0;
    botSpokeRef.current = false;
    persistedKeysRef.current.clear();
    voiceStartTimeRef.current = Date.now();

    try {
      const sessionRes = await fetch("/api/voice/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const sessionData = (await sessionRes.json()) as {
        ready?: boolean;
        reason?: string | null;
        connection?: RealtimeSessionConnection;
      };

      if (!sessionRes.ok || !sessionData.ready || !sessionData.connection) {
        throw new Error(sessionData.reason || "豆包实时语音会话创建失败");
      }

      const connection = sessionData.connection;
      connectionRef.current = connection;
      console.log("[xiaojingzi-rtc] connection created:", { roomId: connection.roomId, userId: connection.userId, botUserId: connection.botUserId });

      const rtcModule = await import("@volcengine/rtc");
      const rtc = rtcModule.default;
      const engine = rtc.createEngine(connection.appId);
      console.log("[xiaojingzi-rtc] engine created for appId:", connection.appId);

      const onUserPublishStream = async (event: { userId: string }) => {
        console.log("[xiaojingzi-rtc] onUserPublishStream:", event.userId);
        if (event.userId !== connection.botUserId) return;

        try {
          await engine.subscribeStream(event.userId, rtcModule.MediaType.AUDIO);
          engine.setPlaybackVolume?.(
            event.userId,
            rtcModule.StreamIndex.STREAM_INDEX_MAIN,
            100
          );
          console.log("[xiaojingzi-rtc] subscribeStream OK:", event.userId);
        } catch (error) {
          console.error("[xiaojingzi-rtc] subscribeStream failed:", error);
          setFallbackReason("已检测到机器人发流，但本地订阅远端音频失败");
        }

        setVoiceState("speaking");
        setTurnCount((prev) => prev + 1);

        if (!botSpokeRef.current) {
          firstResponseLatencyRef.current = Date.now() - voiceStartTimeRef.current;
          botSpokeRef.current = true;
        }
      };

      const onUserUnpublishStream = (event: { userId: string }) => {
        console.log("[xiaojingzi-rtc] onUserUnpublishStream:", event.userId);
        if (event.userId !== connection.botUserId) return;
        setVoiceState("listening");
      };

      const onSubtitleMessageReceived = (
        subtitleMessages: Array<{
          userId: string;
          text: string;
          definite: boolean;
          sequence: number;
        }>
      ) => {
        console.log("[xiaojingzi-rtc] subtitles:", subtitleMessages);
        for (const subtitle of subtitleMessages) {
          const role =
            subtitle.userId === connection.botUserId ? "assistant" : "user";
          const key = `${subtitle.userId}:${subtitle.sequence}:${subtitle.text}`;

          if (role === "user") {
            if (subtitle.definite) {
              setCurrentTranscript("");
              void persistSubtitle("user", subtitle.text, key);
            } else {
              setCurrentTranscript(subtitle.text);
              setVoiceState("listening");
            }
            continue;
          }

          if (subtitle.definite) {
            setDisplayText(subtitle.text);
            setVoiceState("speaking");
            void persistSubtitle("assistant", subtitle.text, key);
          } else {
            setDisplayText(subtitle.text);
            setVoiceState("speaking");
          }
        }
      };

      const onSubtitleStateChanged = (event: {
        event: number;
        errorMessage?: string;
      }) => {
        console.log("[xiaojingzi-rtc] subtitleStateChanged:", event);
        if (
          event.event === rtcModule.SubtitleEventType.ERROR &&
          event.errorMessage
        ) {
          setFallbackReason(`实时字幕不可用：${event.errorMessage}`);
        }
      };

      engine.on(rtc.events.onUserPublishStream, onUserPublishStream);
      engine.on(rtc.events.onUserUnpublishStream, onUserUnpublishStream);
      engine.on(rtc.events.onSubtitleMessageReceived, onSubtitleMessageReceived);
      engine.on(rtc.events.onSubtitleStateChanged, onSubtitleStateChanged);
      engine.on(rtc.events.onRemoteAudioFirstFrame, (event: unknown) => {
        console.log("[xiaojingzi-rtc] onRemoteAudioFirstFrame:", event);
      });
      engine.on(rtc.events.onRemoteAudioPropertiesReport, (event: unknown) => {
        console.log("[xiaojingzi-rtc] onRemoteAudioPropertiesReport:", event);
      });
      engine.on(rtc.events.onError, (err: unknown) => {
        console.error("[xiaojingzi-rtc] engine error:", err);
      });
      engine.on(rtc.events.onUserJoined, (event: { userInfo: { userId: string } }) => {
        console.log("[xiaojingzi-rtc] user joined:", event.userInfo.userId);
      });
      engine.on(rtc.events.onUserLeave, (event: { userInfo: { userId: string } }) => {
        console.log("[xiaojingzi-rtc] user left:", event.userInfo.userId);
      });

      engineRef.current = {
        engine,
        rtc: {
          destroyEngine: rtc.destroyEngine,
          MediaType: rtcModule.MediaType,
          StreamIndex: rtcModule.StreamIndex,
          events: rtc.events,
          SUBTITLE_MODE: rtcModule.SUBTITLE_MODE,
          SubtitleEventType: rtcModule.SubtitleEventType,
        },
      };

      await engine.joinRoom(
        connection.token,
        connection.roomId,
        { userId: connection.userId },
        {
          isAutoPublish: false,
          isAutoSubscribeAudio: true,
          isAutoSubscribeVideo: false,
        }
      );
      console.log("[xiaojingzi-rtc] joinRoom OK");

      await engine.startAudioCapture();
      console.log("[xiaojingzi-rtc] startAudioCapture OK");
      await engine.publishStream(rtcModule.MediaType.AUDIO);
      console.log("[xiaojingzi-rtc] publishStream OK");
      engine.enableAudioPropertiesReport?.({ interval: 300 });
      console.log("[xiaojingzi-rtc] enableAudioPropertiesReport OK");

      if (connection.subtitlesEnabled) {
        try {
          await engine.startSubtitle?.({
            mode: rtcModule.SUBTITLE_MODE.ASR_ONLY,
          });
          console.log("[xiaojingzi-rtc] startSubtitle OK");
        } catch (e) {
          console.warn("[xiaojingzi-rtc] startSubtitle failed:", e);
          setFallbackReason("实时字幕未开启，语音仍可通话，但不会自动保存逐句文本");
        }
      }

      const startRes = await fetch("/api/voice/realtime/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection }),
      });

      if (!startRes.ok) {
        const detail = (await startRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || "StartVoiceChat 调用失败");
      }
      console.log("[xiaojingzi-rtc] StartVoiceChat OK, now listening");

      setVoiceState("listening");
    } catch (error) {
      console.error("[xiaojingzi-rtc] enterVoiceMode error:", error);
      await cleanupRtc();
      connectionRef.current = null;
      setVoiceState("idle");
      setCurrentTranscript("");
      setDisplayText("");
      setFallbackReason(
        error instanceof Error
          ? `${error.message}，当前已回退到兼容语音模式`
          : "豆包实时语音接入失败，当前已回退到兼容语音模式"
      );
    }
  }, [
    cleanupRtc,
    configState.ready,
    enabled,
    messages,
    persistSubtitle,
    sessionId,
  ]);

  const exitVoiceMode = useCallback(async () => {
    const connection = connectionRef.current;
    connectionRef.current = null;

    if (connection) {
      await fetch("/api/voice/realtime/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection }),
      }).catch(() => {});
    }

    await cleanupRtc();
    setVoiceState("idle");
    setCurrentTranscript("");
    setDisplayText("");
  }, [cleanupRtc]);

  const interrupt = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection || voiceState !== "speaking") return;

    interruptCountRef.current += 1;
    setVoiceState("listening");

    await fetch("/api/voice/realtime/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: connection.roomId,
        taskId: connection.taskId,
      }),
    }).catch(() => {});
  }, [voiceState]);

  const getVoiceStats = useCallback(
    () => ({
      voiceDurationMs: voiceStartTimeRef.current
        ? Date.now() - voiceStartTimeRef.current
        : 0,
      voiceTurnCount: turnCount,
      interruptCount: interruptCountRef.current,
      firstResponseLatencyMs: firstResponseLatencyRef.current,
    }),
    [turnCount]
  );

  return {
    canUseRealtime: enabled && configState.ready && isVoiceSupported,
    voiceState,
    currentTranscript,
    displayText,
    interim: "",
    audioLevel: 0,
    turnCount,
    isVoiceSupported,
    enterVoiceMode,
    exitVoiceMode,
    interrupt,
    getVoiceStats,
    fallbackReason:
      enabled && !configState.ready && !isCheckingConfig
        ? fallbackReason
        : null,
    providerLabel: getVoiceProviderLabel("doubao-realtime"),
  };
}
