"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";

const TAG_LABELS: Record<string, string> = {
  clarity: "理清思路",
  emotion: "梳理情绪",
  procrastination: "走出拖延",
  general: "自由对话",
};

interface SessionMeta {
  status: string;
  entryTag: string;
  createdAt: string;
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { messages, isStreaming, sendMessage, initMessages } = useChat(sessionId);
  const [loaded, setLoaded] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [downloading, setDownloading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isCompleted = sessionMeta?.status === "completed";

  // Load session messages
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        if (res.ok) {
          const data = await res.json();
          initMessages(
            data.messages.map(
              (m: { id: string; role: string; content: string }) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
              })
            )
          );
        }
        // 获取 session 元信息
        const sessRes = await fetch(`/api/sessions`);
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          const found = sessData.sessions.find(
            (s: { id: string }) => s.id === sessionId
          );
          if (found) {
            setSessionMeta({
              status: found.status,
              entryTag: found.entryTag,
              createdAt: found.createdAt,
            });
          }
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    }
    loadSession();
  }, [sessionId, initMessages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleEndSession() {
    if (isEnding) return;
    setIsEnding(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        router.push(`/summary/${sessionId}`);
      } else {
        alert("生成总结失败，请重试");
        setIsEnding(false);
      }
    } catch {
      alert("网络错误，请重试");
      setIsEnding(false);
    }
  }

  async function handleDownload(format: "docx" | "txt") {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/export?format=${format}`
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `对话记录.${format}`;
      const disposition = res.headers.get("Content-Disposition");
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (match) a.download = decodeURIComponent(match[1]);
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    } finally {
      setDownloading(false);
    }
  }

  function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming || isCompleted) return;
    sendMessage(trimmed);
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  if (!loaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-white">
        <p className="text-slate-400 animate-pulse">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/history")}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-xl">🪞</span>
          <span className="font-medium text-slate-900">小镜子</span>
          {sessionMeta && (
            <span className="text-xs text-slate-400">
              {TAG_LABELS[sessionMeta.entryTag] || "对话"}
            </span>
          )}
          {isCompleted && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
              已完成
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 下载按钮 */}
          <div className="relative group">
            <button
              disabled={downloading}
              className="rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-40"
              title="下载对话记录"
              onClick={() => handleDownload("docx")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>

          {!isCompleted && (
            <button
              onClick={handleEndSession}
              disabled={isEnding || isStreaming || messages.length < 3}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              {isEnding ? "正在总结..." : "结束对话"}
            </button>
          )}

          {isCompleted && (
            <button
              onClick={() => router.push(`/summary/${sessionId}`)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              查看总结
            </button>
          )}
        </div>
      </header>

      {/* 已完成提示横条 */}
      {isCompleted && (
        <div className="border-b border-slate-50 bg-slate-50 px-4 py-2 text-center text-xs text-slate-400">
          此对话已结束，以下为历史记录
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
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
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    >
                      ·
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    >
                      ·
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    >
                      ·
                    </span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input — 仅在活跃对话时显示 */}
      {!isCompleted ? (
        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
              placeholder="说点什么..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-0 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !inputValue.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:opacity-30"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* 底部操作栏 — 已完成时 */
        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <div className="mx-auto max-w-2xl flex items-center justify-center gap-3">
            <button
              onClick={() => handleDownload("docx")}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-40"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? "下载中..." : "下载 Word"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg px-4 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800 transition-colors"
            >
              开始新对话
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
