"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import type { EntryTag } from "@/types";
import { ENTRY_TAG_LABELS, ENTRY_TAG_ICONS } from "@/types";

const tags: EntryTag[] = ["clarity", "emotion", "procrastination"];

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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read audio blob"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio blob"));
    reader.readAsDataURL(blob);
  });
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
      const res = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      />
    </div>
  );
}

function ChatInput({
  onSend,
  disabled,
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
}) {
  const [value, setValue] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const keyboardRecordingRef = useRef(false);
  const isVoiceSubmittingRef = useRef(false);
  const {
    isRecording,
    error: recorderError,
    setError: setRecorderError,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  }

  const startVoiceRecording = useCallback(async (source: "button" | "space") => {
    if (disabled) return;
    if (isRecording || isVoiceSubmittingRef.current) return;

    setRecorderError(null);
    const started = await startRecording();
    if (started) {
      keyboardRecordingRef.current = source === "space";
      setVoiceStatus(source === "space" ? "正在录音，松开空格发送" : "录音中，再点一次结束");
    }
  }, [disabled, isRecording, setRecorderError, startRecording]);

  const stopVoiceRecording = useCallback(async () => {
    if (!isRecording || isVoiceSubmittingRef.current) return;

    isVoiceSubmittingRef.current = true;
    setVoiceStatus("正在转写...");
    const result = await stopRecording();

    if (!result?.file || result.file.size === 0 || !result.blob) {
      setVoiceStatus(null);
      setRecorderError("没有录到有效语音，请再试一次");
      keyboardRecordingRef.current = false;
      isVoiceSubmittingRef.current = false;
      return;
    }

    try {
      const audioUrl = await blobToDataUrl(result.blob);
      const formData = new FormData();
      formData.append("file", result.file);

      const response = await fetch("/api/asr", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Transcription failed");
      }

      const transcript = (data.text || "").trim();
      if (!transcript) {
        throw new Error("没有识别到文字");
      }

      onSend(transcript, {
        inputMode: "voice",
        audioUrl,
        audioDurationMs: result.durationMs,
      });
      setVoiceStatus(null);
    } catch (error) {
      console.error("Voice transcription failed:", error);
      setVoiceStatus(null);
      setRecorderError("语音转写失败，请再试一次");
    } finally {
      keyboardRecordingRef.current = false;
      isVoiceSubmittingRef.current = false;
    }
  }, [isRecording, onSend, setRecorderError, stopRecording]);

  async function handleVoiceToggle() {
    if (isRecording) {
      await stopVoiceRecording();
      return;
    }
    await startVoiceRecording("button");
  }

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px";
  }, [value]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      if (event.repeat || disabled || isRecording || isVoiceSubmittingRef.current) return;
      if (value.trim()) return;

      const activeElement = document.activeElement;
      const isTypingField =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement instanceof HTMLButtonElement ||
        (activeElement instanceof HTMLTextAreaElement && activeElement.value.trim().length > 0);

      if (isTypingField) return;

      event.preventDefault();
      void startVoiceRecording("space");
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      if (!keyboardRecordingRef.current) return;
      event.preventDefault();
      void stopVoiceRecording();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [disabled, isRecording, startVoiceRecording, stopVoiceRecording, value]);

  const canSend = !!value.trim() && !disabled;
  const voiceHint =
    recorderError || voiceStatus || "点击麦克风开始，或按住空格说话，松开发送";

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      <div className="mx-auto max-w-2xl space-y-2">
        <p className={`text-xs ${recorderError ? "text-red-500" : "text-slate-400"}`}>
          {voiceHint}
        </p>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={disabled}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              isRecording
                ? "border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
            } disabled:opacity-30`}
            title={isRecording ? "结束录音" : "开始录音"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M8.25 5.25A3.75 3.75 0 0 1 12 1.5a3.75 3.75 0 0 1 3.75 3.75v6a3.75 3.75 0 0 1-7.5 0v-6Z" />
              <path d="M6 10.5a.75.75 0 0 1 .75.75v.75a5.25 5.25 0 0 0 10.5 0v-.75a.75.75 0 0 1 1.5 0v.75a6.75 6.75 0 0 1-6 6.705V21a.75.75 0 0 1-1.5 0v-2.295a6.75 6.75 0 0 1-6-6.705v-.75A.75.75 0 0 1 6 10.5Z" />
            </svg>
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
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
            placeholder="说点什么..."
            disabled={disabled}
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
    </div>
  );
}
