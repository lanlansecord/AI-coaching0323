"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionItem {
  id: string;
  entryTag: string;
  mode: string;
  status: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
  summaryJson: { blocks: { title: string; content: string }[] } | null;
}

const TAG_LABELS: Record<string, string> = {
  clarity: "理清思路",
  emotion: "梳理情绪",
  procrastination: "走出拖延",
  general: "自由对话",
};

const TAG_ICONS: Record<string, string> = {
  clarity: "🧠",
  emotion: "💛",
  procrastination: "🚀",
  general: "💬",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleDownload(sessionId: string, format: "docx" | "txt") {
    setDownloading(sessionId);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/export?format=${format}`
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `对话记录.${format}`;

      // 从 Content-Disposition 获取文件名
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
      alert("下载失败，请重试");
    } finally {
      setDownloading(null);
    }
  }

  function handleOpen(sessionId: string) {
    router.push(`/session/${sessionId}`);
  }

  if (loading) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-white">
        <div className="text-4xl mb-4">🪞</div>
        <p className="text-slate-400 animate-pulse text-sm">加载对话记录...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors"
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
            <span className="font-medium text-slate-900">对话记录</span>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg px-3 py-1.5 text-sm text-white bg-slate-900 hover:bg-slate-800 transition-colors"
          >
            新对话
          </button>
        </div>
      </header>

      {/* 对话列表 */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-slate-500 text-sm">还没有对话记录</p>
            <p className="text-slate-400 text-xs mt-1">
              开始和小镜子聊聊吧
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-6 rounded-lg px-4 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800 transition-colors"
            >
              开始对话
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="group bg-white rounded-xl border border-slate-100 overflow-hidden hover:border-slate-200 hover:shadow-sm transition-all"
              >
                {/* 点击区域 — 打开对话 */}
                <button
                  onClick={() => handleOpen(session.id)}
                  className="w-full text-left px-4 pt-4 pb-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">
                      {TAG_ICONS[session.entryTag] || "💬"}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {TAG_LABELS[session.entryTag] || session.entryTag}
                    </span>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        session.status === "completed"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {session.status === "completed" ? "已完成" : "进行中"}
                    </span>
                    {session.mode === "voice" && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600">
                        语音
                      </span>
                    )}
                  </div>

                  {/* 预览文本 */}
                  {session.preview ? (
                    <p className="text-sm text-slate-500 line-clamp-2 mb-2">
                      {session.preview}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400 italic mb-2">
                      (无用户消息)
                    </p>
                  )}

                  {/* 元信息 */}
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{formatDate(session.createdAt)}</span>
                    <span>·</span>
                    <span>{session.messageCount} 条消息</span>
                  </div>
                </button>

                {/* 底部操作栏 */}
                <div className="flex items-center border-t border-slate-50 px-4 py-2 gap-2">
                  <button
                    onClick={() => handleDownload(session.id, "docx")}
                    disabled={downloading === session.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-40"
                  >
                    <svg
                      width="14"
                      height="14"
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
                    {downloading === session.id ? "下载中..." : "Word"}
                  </button>

                  <button
                    onClick={() => handleDownload(session.id, "txt")}
                    disabled={downloading === session.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-40"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    TXT
                  </button>

                  <div className="flex-1" />

                  <button
                    onClick={() => handleOpen(session.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  >
                    查看对话
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
