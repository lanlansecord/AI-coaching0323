"use client";
import { useState, useEffect, useCallback } from "react";

interface Stats {
  totalSessions: number;
  todaySessions: number;
  uniqueGuests: number;
  todayGuests: number;
  avgMsgCount: number;
  modeStats: Record<string, number>;
  tagStats: Record<string, number>;
  statusStats: Record<string, number>;
  feedbackAvg: {
    heard: number;
    clearer: number;
    returnIntent: number;
    count: number;
  } | null;
}

interface SessionItem {
  id: string;
  guestId: string;
  entryTag: string;
  mode: string;
  status: string;
  completionReason: string | null;
  aiModel: string | null;
  createdAt: string;
  endedAt: string | null;
  messageCount: number;
  voiceDurationMs: number | null;
  voiceTurnCount: number | null;
  feedback: {
    heard: number | null;
    clearer: number | null;
    returnIntent: number | null;
    text: string | null;
  } | null;
}

interface SessionDetail {
  session: Record<string, unknown>;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    inputMode: string | null;
    createdAt: string;
  }>;
  feedback: Record<string, unknown> | null;
}

const TAG_LABELS: Record<string, string> = {
  clarity: "理清思路",
  emotion: "梳理情绪",
  procrastination: "走出拖延",
  general: "自由聊天",
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "sessions" | "feedback">("overview");

  const headers = useCallback(
    () => ({ "x-admin-password": password }),
    [password]
  );

  // 验证密码 + 加载数据
  async function handleLogin() {
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        setAuthed(true);
        setAuthError(false);
        const data = await res.json();
        setStats(data);
        loadSessions(1);
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    }
  }

  async function loadSessions(p: number) {
    const res = await fetch(`/api/admin/sessions?page=${p}&limit=20`, {
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
      setTotal(data.total);
      setPage(p);
    }
  }

  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    const res = await fetch(`/api/admin/sessions/${id}`, {
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      const data = await res.json();
      setDetail(data);
      setExpandedId(id);
    }
  }

  // 未登录：密码输入
  if (!authed) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50">
        <div className="w-80 rounded-2xl bg-white p-6 shadow-lg">
          <div className="text-center mb-6">
            <span className="text-3xl">🪞</span>
            <h1 className="mt-2 text-lg font-bold text-slate-900">小镜子 管理后台</h1>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="请输入管理密码"
            className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none"
          />
          {authError && (
            <p className="mt-2 text-xs text-red-500">密码错误</p>
          )}
          <button
            onClick={handleLogin}
            className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm text-white hover:bg-slate-800"
          >
            进入
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪞</span>
            <h1 className="font-bold text-slate-900">小镜子 管理后台</h1>
          </div>
          <div className="flex gap-1">
            {(["overview", "sessions", "feedback"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                  tab === t
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {t === "overview" ? "概览" : t === "sessions" ? "对话" : "反馈"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Overview Tab */}
        {tab === "overview" && stats && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="总对话" value={stats.totalSessions} />
              <StatCard label="今日对话" value={stats.todaySessions} />
              <StatCard label="独立用户" value={stats.uniqueGuests} />
              <StatCard label="今日用户" value={stats.todayGuests} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="平均消息数/对话" value={stats.avgMsgCount} />
              <StatCard
                label="语音对话"
                value={stats.modeStats.voice || 0}
                sub={`占比 ${stats.totalSessions > 0 ? Math.round(((stats.modeStats.voice || 0) / stats.totalSessions) * 100) : 0}%`}
              />
              <StatCard
                label="已完成"
                value={stats.statusStats.completed || 0}
                sub={`共 ${stats.totalSessions} 个对话`}
              />
            </div>

            {/* Tag Distribution */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-3">标签分布</h3>
              <div className="space-y-2">
                {Object.entries(stats.tagStats).map(([tag, cnt]) => (
                  <div key={tag} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-20">
                      {TAG_LABELS[tag] || tag}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-sky-400 h-full rounded-full transition-all"
                        style={{
                          width: `${stats.totalSessions > 0 ? (cnt / stats.totalSessions) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-slate-500 w-8 text-right">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feedback Avg */}
            {stats.feedbackAvg && (
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-700 mb-3">
                  反馈平均分（{stats.feedbackAvg.count} 条）
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <ScoreCard label="被听见" score={stats.feedbackAvg.heard} />
                  <ScoreCard label="更清楚" score={stats.feedbackAvg.clearer} />
                  <ScoreCard label="愿意再来" score={stats.feedbackAvg.returnIntent} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab */}
        {tab === "sessions" && (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl bg-white shadow-sm overflow-hidden">
                <button
                  onClick={() => loadDetail(s.id)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.mode === "voice"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.mode === "voice" ? "语音" : "文字"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {TAG_LABELS[s.entryTag] || s.entryTag}
                      </span>
                      <span className="text-xs text-slate-400">
                        {s.messageCount} 条消息
                      </span>
                      {s.voiceDurationMs && (
                        <span className="text-xs text-slate-400">
                          {Math.round(s.voiceDurationMs / 1000)}s 语音
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs ${
                          s.status === "completed"
                            ? "text-green-500"
                            : s.status === "abandoned"
                            ? "text-orange-500"
                            : "text-slate-400"
                        }`}
                      >
                        {s.status === "completed" ? "已完成" : s.status === "abandoned" ? "已放弃" : "进行中"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(s.createdAt).toLocaleString("zh-CN")}
                      </span>
                      <span className="text-slate-300">{expandedId === s.id ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {s.feedback && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      {s.feedback.heard != null && <span>被听见: {s.feedback.heard}/5</span>}
                      {s.feedback.clearer != null && <span>更清楚: {s.feedback.clearer}/5</span>}
                      {s.feedback.returnIntent != null && <span>再来: {s.feedback.returnIntent}/5</span>}
                      {s.feedback.text && (
                        <span className="text-slate-500 truncate max-w-xs">
                          「{s.feedback.text}」
                        </span>
                      )}
                    </div>
                  )}
                </button>

                {/* Expanded detail */}
                {expandedId === s.id && detail && (
                  <div className="border-t px-5 py-4 bg-slate-50 space-y-3 max-h-96 overflow-y-auto">
                    {detail.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                            msg.role === "user"
                              ? "bg-slate-800 text-white"
                              : msg.role === "system"
                              ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                              : "bg-white text-slate-700 border border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] opacity-60">
                              {msg.role === "user" ? "用户" : msg.role === "system" ? "系统" : "AI"}
                              {msg.inputMode === "voice" && " 🎤"}
                            </span>
                            <span className="text-[10px] opacity-40">
                              {new Date(msg.createdAt).toLocaleTimeString("zh-CN")}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <button
                  onClick={() => loadSessions(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 text-sm rounded-lg bg-white shadow-sm disabled:opacity-30"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm text-slate-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => loadSessions(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-sm rounded-lg bg-white shadow-sm disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}

        {/* Feedback Tab */}
        {tab === "feedback" && (
          <div className="space-y-3">
            {sessions
              .filter((s) => s.feedback)
              .map((s) => (
                <div key={s.id} className="rounded-xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {new Date(s.createdAt).toLocaleString("zh-CN")}
                      </span>
                      <span className="text-xs text-slate-400">
                        {TAG_LABELS[s.entryTag] || s.entryTag}
                      </span>
                      <span
                        className={`text-xs ${
                          s.mode === "voice" ? "text-sky-500" : "text-slate-400"
                        }`}
                      >
                        {s.mode === "voice" ? "语音" : "文字"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setTab("sessions");
                        loadDetail(s.id);
                      }}
                      className="text-xs text-sky-500 hover:underline"
                    >
                      查看对话
                    </button>
                  </div>
                  <div className="flex gap-4 mb-2">
                    {s.feedback!.heard != null && (
                      <ScoreChip label="被听见" score={s.feedback!.heard!} />
                    )}
                    {s.feedback!.clearer != null && (
                      <ScoreChip label="更清楚" score={s.feedback!.clearer!} />
                    )}
                    {s.feedback!.returnIntent != null && (
                      <ScoreChip label="愿意再来" score={s.feedback!.returnIntent!} />
                    )}
                  </div>
                  {s.feedback!.text && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                      {s.feedback!.text}
                    </p>
                  )}
                </div>
              ))}
            {sessions.filter((s) => s.feedback).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-12">暂无反馈数据</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-slate-900">{score}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      <div className="flex justify-center mt-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`text-xs ${i <= Math.round(score) ? "text-amber-400" : "text-slate-200"}`}
          >
            ★
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const color = score >= 4 ? "text-green-600 bg-green-50" : score >= 3 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${color}`}>
      {label}: {score}/5
    </span>
  );
}
