"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useSpeech } from "@/hooks/use-speech";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import type { EntryTag } from "@/types";
import { ENTRY_TAG_LABELS, ENTRY_TAG_ICONS } from "@/types";

const tags: EntryTag[] = ["clarity", "emotion", "procrastination"];

export default function HomePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const chat = useChat(sessionId || "");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 语音对话
  const voice = useVoiceChat({
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    sendMessage: chat.sendMessage,
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

  async function handleEndSession() {
    if (!sessionId || isEnding) return;
    setIsEnding(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
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

  function handleSend(message: string) {
    if (!sessionId) return;
    chat.sendMessage(message);
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
          {/* 对话记录入口 */}
          <button
            onClick={() => router.push("/history")}
            className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="对话记录"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </button>
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
                  <p className="whitespace-pre-wrap">{msg.content}</p>
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
        onVoiceMode={voice.isVoiceSupported ? voice.enterVoiceMode : undefined}
      />

      {/* 语音对话覆盖层 */}
      {voice.voiceState !== "idle" && (
        <VoiceOverlay
          voiceState={voice.voiceState}
          currentTranscript={voice.currentTranscript}
          displayText={voice.displayText}
          interim={voice.interim}
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
}: {
  onSend: (msg: string) => void;
  disabled: boolean;
  onVoiceMode?: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Speech recognition
  const speech = useSpeech(
    useCallback((text: string) => {
      setValue((prev) => prev + text);
    }, [])
  );

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    // Stop listening if sending
    if (speech.isListening) speech.stopListening();
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  }

  // Display value: current text + interim speech
  const displayValue = speech.interim ? value + speech.interim : value;

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      {/* Listening indicator */}
      {speech.isListening && (
        <div className="mx-auto max-w-2xl mb-2 flex items-center justify-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-xs text-red-500 font-medium">正在听你说...</span>
        </div>
      )}

      <div className="mx-auto flex max-w-2xl items-end gap-2">
        {/* Voice mode button */}
        {onVoiceMode && (
          <button
            onClick={onVoiceMode}
            disabled={disabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white transition-all hover:from-sky-500 hover:to-cyan-600 active:scale-95 disabled:opacity-30"
            title="语音对话模式"
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
        {speech.isSupported && (
          <button
            onClick={speech.toggleListening}
            disabled={disabled}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all ${
              speech.isListening
                ? "bg-red-500 text-white animate-pulse"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            } disabled:opacity-30`}
            title={speech.isListening ? "停止录音" : "语音输入"}
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
          placeholder={speech.isListening ? "说话中..." : "说点什么..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
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
