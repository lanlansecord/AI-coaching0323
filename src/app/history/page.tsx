"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionItem {
  id: string;
  entryTag: string;
  mode: string;
  status: string;
  title: string | null;
  isFavorite: boolean;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
  summaryJson: { blocks: { title: string; content: string }[] } | null;
}

type TabType = "all" | "favorites";

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
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  // 过滤列表
  const filtered =
    activeTab === "favorites"
      ? sessions.filter((s) => s.isFavorite)
      : sessions;

  const favoriteCount = sessions.filter((s) => s.isFavorite).length;

  // 收藏/取消
  async function handleToggleFavorite(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const newVal = !session.isFavorite;
    // 乐观更新
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, isFavorite: newVal } : s))
    );

    try {
      await fetch(`/api/sessions/${sessionId}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: newVal }),
      });
    } catch {
      // 回滚
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, isFavorite: !newVal } : s
        )
      );
    }
  }

  // 删除
  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();

    if (confirmDelete !== sessionId) {
      setConfirmDelete(sessionId);
      // 3 秒后自动取消确认状态
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }

    // 确认删除
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setConfirmDelete(null);

    try {
      await fetch(`/api/sessions/${sessionId}/delete`, { method: "DELETE" });
    } catch {
      // 重新加载
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    }
  }

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

  // 获取显示标题
  function getDisplayTitle(session: SessionItem) {
    if (session.title) return session.title;
    const tagLabel = TAG_LABELS[session.entryTag] || "自由对话";
    if (session.preview) {
      const short =
        session.preview.length > 20
          ? session.preview.slice(0, 20) + "..."
          : session.preview;
      return `${tagLabel}-${short}`;
    }
    return tagLabel;
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
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center text-slate-500 hover:text-slate-700 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Tab 切换 */}
        <div className="mx-auto max-w-2xl px-4 flex gap-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "all"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            全部
            <span className="ml-1.5 text-xs text-slate-400">
              {sessions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "favorites"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            ⭐ 收藏
            {favoriteCount > 0 && (
              <span className="ml-1.5 text-xs text-amber-500">
                {favoriteCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 对话列表 */}
      <div className="mx-auto max-w-2xl px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">
              {activeTab === "favorites" ? "⭐" : "📝"}
            </div>
            <p className="text-slate-500 text-sm">
              {activeTab === "favorites"
                ? "还没有收藏的对话"
                : "还没有对话记录"}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {activeTab === "favorites"
                ? "点击 ⭐ 可以收藏重要的对话"
                : "开始和小镜子聊聊吧"}
            </p>
            {activeTab === "all" && (
              <button
                onClick={() => router.push("/")}
                className="mt-6 rounded-lg px-4 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800 transition-colors"
              >
                开始对话
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((session) => (
              <div
                key={session.id}
                className="group bg-white rounded-xl border border-slate-100 overflow-hidden hover:border-slate-200 hover:shadow-sm transition-all"
              >
                {/* 主体点击区域 */}
                <button
                  onClick={() => handleOpen(session.id)}
                  className="w-full text-left px-4 pt-4 pb-3"
                >
                  {/* 标题行 */}
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-base shrink-0 mt-0.5">
                      {TAG_ICONS[session.entryTag] || "💬"}
                    </span>
                    <h3 className="text-sm font-medium text-slate-800 line-clamp-1 flex-1">
                      {getDisplayTitle(session)}
                    </h3>
                    {session.isFavorite && (
                      <span className="text-amber-400 shrink-0">⭐</span>
                    )}
                  </div>

                  {/* 预览 */}
                  {session.preview && (
                    <p className="text-xs text-slate-400 line-clamp-2 mb-2 ml-7">
                      {session.preview}
                    </p>
                  )}

                  {/* 元信息 */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 ml-7">
                    <span>{formatDate(session.createdAt)}</span>
                    <span>·</span>
                    <span>{session.messageCount} 条消息</span>
                    {session.status === "completed" && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-500">已完成</span>
                      </>
                    )}
                    {session.mode === "voice" && (
                      <>
                        <span>·</span>
                        <span className="text-sky-500">语音</span>
                      </>
                    )}
                  </div>
                </button>

                {/* 操作栏 */}
                <div className="flex items-center border-t border-slate-50 px-3 py-1.5 gap-1">
                  {/* 收藏 */}
                  <button
                    onClick={(e) => handleToggleFavorite(e, session.id)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      session.isFavorite
                        ? "text-amber-500 hover:bg-amber-50"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    }`}
                    title={session.isFavorite ? "取消收藏" : "收藏"}
                  >
                    {session.isFavorite ? "⭐" : "☆"}
                    <span>{session.isFavorite ? "已收藏" : "收藏"}</span>
                  </button>

                  {/* 下载 */}
                  <button
                    onClick={() => handleDownload(session.id, "docx")}
                    disabled={downloading === session.id}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors disabled:opacity-40"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloading === session.id ? "..." : "下载"}
                  </button>

                  <div className="flex-1" />

                  {/* 删除 */}
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      confirmDelete === session.id
                        ? "text-red-600 bg-red-50 font-medium"
                        : "text-slate-400 hover:bg-red-50 hover:text-red-500"
                    }`}
                  >
                    {confirmDelete === session.id ? "确认删除？" : "删除"}
                  </button>

                  {/* 查看 */}
                  <button
                    onClick={() => handleOpen(session.id)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                  >
                    查看
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
