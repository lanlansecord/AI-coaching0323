"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useWavRecorder } from "@/hooks/use-wav-recorder";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import type { EntryTag } from "@/types";
import { ENTRY_TAG_LABELS, ENTRY_TAG_ICONS } from "@/types";

const tags: EntryTag[] = ["clarity", "emotion", "procrastination"];

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

function shouldUseSpaceForVoiceShortcut(target: EventTarget | null, currentValue: string) {
  if (!(target instanceof HTMLElement)) return true;
  if (!isEditableElement(target)) return true;

  // 输入框里已经有文字时，保留正常空格输入。
  if (currentValue.trim()) return false;

  // 空输入框允许直接按住空格开始录音。
  return true;
}

interface UserInfo {
  id: string;
  phone: string;
  displayName?: string;
}

function formatVoiceDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  return `${totalSeconds}"`;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const chat = useChat(sessionId || "");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 语音对话
  const voice = useVoiceChat({
    sessionId,
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    sendMessage: chat.sendMessage,
    appendMessage: chat.appendMessage,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages]);

  // Create session (with or without tag)
  const createSession = useCallback(
    async (tag?: EntryTag) => {
      if (creating) return;
      setCreating(true);

      try {
        const body: Record<string, string> = {};
        if (tag) body.entryTag = tag;

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("Failed");

        const data = await res.json();
        setSessionId(data.sessionId);
        chat.initMessages([
          {
            id: "opening",
            role: "assistant",
            content: data.firstMessage,
          },
        ]);
      } catch {
        alert("连接失败，请刷新重试");
      } finally {
        setCreating(false);
      }
    },
    [creating, chat]
  );

  // Auto-create a general session on mount
  useEffect(() => {
    createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取用户登录状态
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.isAuthenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setShowUserMenu(false);
  }

  async function handleEndSession() {
    if (!sessionId || isEnding) return;
    setIsEnding(true);
    try {
      const voiceStats =
        voice.turnCount > 0
          ? {
              mode: "voice",
              ...voice.getVoiceStats(),
            }
          : undefined;
      const res = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiceStats ?? {}),
      });
      if (res.ok) {
        router.push(`/summary/${sessionId}`);
      } else {
        setIsEnding(false);
      }
    } catch {
      setIsEnding(false);
    }
  }

  function handleSend(
    message: string,
    options?: {
      inputMode?: "text" | "voice";
      audioUrl?: string;
      audioDurationMs?: number;
    }
  ) {
    if (!sessionId) return;
    chat.sendMessage(message, options);
  }

  // Loading screen
  if (!sessionId) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-white">
        <div className="text-4xl mb-4">🪞</div>
        <h1 className="text-xl font-bold text-slate-900">小镜子</h1>
        <p className="mt-1 text-sm text-slate-400">照见你的潜意识</p>
        <p className="mt-6 text-slate-400 animate-pulse text-sm">正在准备...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🪞</span>
          <span className="font-medium text-slate-900">小镜子</span>
          <span className="hidden sm:inline text-xs text-slate-400">
            照见你的潜意识
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 对话记录 */}
          <button
            onClick={() => router.push("/history")}
            className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="对话记录"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </button>

          {/* 用户菜单 / 登录入口 */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
                title={user.displayName || user.phone}
              >
                {(user.displayName || user.phone).slice(-2)}
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
                    <div className="px-3 py-2 border-b border-slate-50">
                      <p className="text-sm font-medium text-slate-700">{user.displayName}</p>
                      <p className="text-xs text-slate-400">{user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}</p>
                    </div>
                    <button
                      onClick={() => { router.push("/history"); setShowUserMenu(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      对话记录
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              登录
            </button>
          )}

          <button
            onClick={handleEndSession}
            disabled={isEnding || chat.isStreaming || chat.messages.length < 3}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            {isEnding ? "正在总结..." : "结束对话"}
          </button>
        </div>
      </header>

      {/* Tag chips — only shown at start */}
      {chat.messages.length <= 1 && (
        <div className="border-b border-slate-50 bg-white px-4 py-3">
          <div className="flex justify-center gap-2 flex-wrap">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setSessionId(null);
                  setTimeout(() => createSession(tag), 50);
                }}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-all hover:border-slate-300 hover:shadow-sm active:scale-95"
              >
                <span>{ENTRY_TAG_ICONS[tag]}</span>
                <span>{ENTRY_TAG_LABELS[tag]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-300">
            选一个方向，或者直接打字聊 · 小镜子是 AI 对话工具，不提供心理诊断
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {chat.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {msg.content ? (
                  msg.role === "user" && msg.inputMode === "voice" ? (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                        <span>{msg.audioUrl ? "🎤 语音消息" : "🎤 语音转写"}</span>
                        {formatVoiceDuration(msg.audioDurationMs) && (
                          <span>{formatVoiceDuration(msg.audioDurationMs)}</span>
                        )}
                      </div>
                      {msg.audioUrl && (
                        <audio
                          controls
                          src={msg.audioUrl}
                          preload="metadata"
                          className="block h-10 w-full max-w-xs"
                        />
                      )}
                      <p className="whitespace-pre-wrap text-white/95">{msg.content}</p>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={chat.isStreaming || isEnding}
        onVoiceMode={undefined}
        voiceHint={null}
        voiceButtonLabel="实时语音"
      />

      {/* 语音对话覆盖层 */}
      {voice.voiceState !== "idle" && (
        <VoiceOverlay
          voiceState={voice.voiceState}
          currentTranscript={voice.currentTranscript}
          displayText={voice.displayText}
          interim={voice.interim}
          audioLevel={voice.audioLevel}
          turnCount={voice.turnCount}
          providerLabel={voice.providerLabel}
          fallbackReason={voice.fallbackReason}
          onClose={voice.exitVoiceMode}
          onInterrupt={voice.interrupt}
        />
      )}
    </div>
  );
}

function ChatInput({
  onSend,
  disabled,
  onVoiceMode,
  voiceHint,
  voiceButtonLabel,
}: {
  onSend: (
    msg: string,
    options?: {
      inputMode?: "text" | "voice";
      audioUrl?: string;
      audioDurationMs?: number;
    }
  ) => void;
  disabled: boolean;
  onVoiceMode?: () => void;
  voiceHint?: string | null;
  voiceButtonLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceSubmitting, setIsVoiceSubmitting] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const voiceStartedAtRef = useRef(0);
  const isVoiceRecordingRef = useRef(false);
  const isVoiceFinalizingRef = useRef(false);
  const stopVoiceMessageRef = useRef<() => Promise<void>>(async () => {});
  const shortcutModeRef = useRef<"space" | "toggle" | null>(null);
  const recorderStartPromiseRef = useRef<Promise<void> | null>(null);
  const recorder = useWavRecorder();

  const cleanupVoiceMedia = useCallback(() => {
    recorder.cleanup();
    setVoiceDraft("");
  }, [recorder]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    const formData = new FormData();
    formData.append("audio", blob, "voice-input.wav");

    const response = await fetch("/api/asr", {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : typeof data?.error === "string"
            ? data.error
            : `ASR request failed (${response.status})`;
      throw new Error(detail);
    }

    return typeof data?.text === "string" ? data.text.trim() : "";
  }, []);

  const stopVoiceMessage = useCallback(async () => {
    if (!isVoiceRecordingRef.current || isVoiceFinalizingRef.current) return;

    isVoiceFinalizingRef.current = true;
    isVoiceRecordingRef.current = false;
    shortcutModeRef.current = null;
    setIsVoiceRecording(false);
    setIsVoiceSubmitting(true);
    setVoiceNotice("已录音，正在转写，转好后会自动发送...");

    // Wait for recorder.start() to fully initialize before stopping
    if (recorderStartPromiseRef.current) {
      await recorderStartPromiseRef.current;
      recorderStartPromiseRef.current = null;
    }

    const { blob, audioUrl, durationMs } = await recorder.stop();

    if (!blob || !audioUrl || durationMs <= 0) {
      isVoiceFinalizingRef.current = false;
      setIsVoiceSubmitting(false);
      setVoiceDraft("");
      setVoiceNotice("刚刚没听清，再试一次");
      window.setTimeout(() => setVoiceNotice(null), 1600);
      return;
    }

    let transcript = "";
    try {
      transcript = await transcribeAudio(blob);
    } catch {
      isVoiceFinalizingRef.current = false;
      setIsVoiceSubmitting(false);
      setVoiceDraft("");
      setVoiceNotice("语音转写失败，再试一次");
      window.setTimeout(() => setVoiceNotice(null), 1800);
      return;
    }

    isVoiceFinalizingRef.current = false;
    setIsVoiceSubmitting(false);
    setVoiceDraft(transcript);
    setVoiceNotice(null);

    if (!transcript) {
      setVoiceNotice("刚刚没听清，再试一次");
      window.setTimeout(() => setVoiceNotice(null), 1600);
      return;
    }

    onSend(transcript, {
      inputMode: "voice",
      audioUrl,
      audioDurationMs: durationMs,
    });
    setValue("");
    setVoiceDraft("");
    if (ref.current) ref.current.style.height = "auto";
  }, [onSend, recorder, transcribeAudio]);

  useEffect(() => {
    stopVoiceMessageRef.current = stopVoiceMessage;
  }, [stopVoiceMessage]);

  const startVoiceMessage = useCallback(async () => {
    if (
      disabled ||
      !recorder.isSupported ||
      isVoiceRecordingRef.current ||
      isVoiceFinalizingRef.current
    ) {
      return;
    }

    try {
      setVoiceNotice("开始录音了，松开后会发送语音和转写");
      setValue("");
      setVoiceDraft("");
      voiceStartedAtRef.current = Date.now();

      isVoiceRecordingRef.current = true;
      setIsVoiceRecording(true);
      const startPromise = recorder.start();
      recorderStartPromiseRef.current = startPromise;
      await startPromise;
      recorderStartPromiseRef.current = null;
    } catch {
      cleanupVoiceMedia();
      isVoiceRecordingRef.current = false;
      recorderStartPromiseRef.current = null;
      shortcutModeRef.current = null;
      setIsVoiceRecording(false);
      setVoiceNotice("麦克风没打开，试试授权后再说");
      window.setTimeout(() => setVoiceNotice(null), 1800);
    }
  }, [cleanupVoiceMedia, disabled, recorder]);

  function handleSubmit() {
    if (isVoiceRecording) return;
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  }

  useEffect(() => {
    return () => {
      cleanupVoiceMedia();
    };
  }, [cleanupVoiceMedia]);

  // Display value: current text + interim speech
  const displayValue = isVoiceRecording ? voiceDraft : value;
  const canSend =
    !isVoiceRecording && !isVoiceSubmitting && !!displayValue.trim() && !disabled;

  useEffect(() => {
    if (!recorder.isSupported) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (disabled || event.repeat) return;

      const key = event.key.toLowerCase();
      const isSpace = event.code === "Space" || event.key === " ";

      if (
        isSpace &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        shouldUseSpaceForVoiceShortcut(event.target, value)
      ) {
        event.preventDefault();
        if (isVoiceRecordingRef.current || isVoiceFinalizingRef.current) return;
        shortcutModeRef.current = "space";
        void startVoiceMessage();
        return;
      }

      if (key === "v" && event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (isVoiceFinalizingRef.current) return;
        if (isVoiceRecordingRef.current) {
          void stopVoiceMessageRef.current();
        } else if (!disabled) {
          shortcutModeRef.current = "toggle";
          void startVoiceMessage();
        }
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (
        (event.code === "Space" || event.key === " ") &&
        shortcutModeRef.current === "space" &&
        isVoiceRecordingRef.current &&
        !isVoiceFinalizingRef.current
      ) {
        event.preventDefault();
        void stopVoiceMessageRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [disabled, recorder.isSupported, startVoiceMessage, value]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px";
  }, [displayValue]);

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      {/* Listening indicator */}
      {isVoiceRecording && (
        <div className="mx-auto max-w-2xl mb-2 flex items-center justify-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-xs text-red-500 font-medium">
            正在录音，松开空格会发送
          </span>
        </div>
      )}

      {isVoiceSubmitting && (
        <div className="mx-auto max-w-2xl mb-2 flex items-center justify-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
          </span>
          <span className="text-xs text-sky-500 font-medium">
            正在转写，转好后会自动发送
          </span>
        </div>
      )}

      {voiceNotice && (
        <div className="mx-auto mb-2 max-w-2xl text-center text-xs text-slate-400">
          {voiceNotice}
        </div>
      )}

      {recorder.isSupported && (
        <div className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-slate-300">
          快捷键：按住空格说话，松开后会发送语音和转写；或按 <span className="font-medium text-slate-400">Alt + V</span> 开始/结束语音
        </div>
      )}

      {voiceHint && onVoiceMode && (
        <div className="mx-auto max-w-2xl mb-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {voiceHint}
        </div>
      )}

      <div className="mx-auto flex max-w-2xl items-end gap-2">
        {/* Voice mode button */}
        {onVoiceMode && (
          <button
            onClick={onVoiceMode}
            disabled={disabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white transition-all hover:from-sky-500 hover:to-cyan-600 active:scale-95 disabled:opacity-30"
            title={voiceButtonLabel || "语音对话模式"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}

        {/* Mic button (text input assist) */}
        {recorder.isSupported && (
          <button
            onClick={() => {
              if (isVoiceFinalizingRef.current) return;
              if (isVoiceRecordingRef.current) {
                void stopVoiceMessageRef.current();
              } else {
                void startVoiceMessage();
              }
            }}
            disabled={disabled}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all ${
              isVoiceRecording || isVoiceSubmitting
                ? "bg-red-500 text-white animate-pulse"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            } disabled:opacity-30`}
            title={isVoiceRecording || isVoiceSubmitting ? "结束并发送语音" : "语音输入"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
              <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
            </svg>
          </button>
        )}

        <textarea
          ref={ref}
          value={displayValue}
          onChange={(e) => {
            if (isVoiceRecording) return;
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (isVoiceRecording) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
          placeholder={
            isVoiceRecording
              ? "正在录音，松开就会发送..."
              : isVoiceSubmitting
                ? "正在转写，完成后会自动发送..."
              : "说点什么..."
          }
          disabled={disabled}
          readOnly={isVoiceRecording || isVoiceSubmitting}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:opacity-30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
