"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SummaryBlocks } from "@/components/summary/SummaryBlocks";
import { FeedbackForm } from "@/components/summary/FeedbackForm";
import type { SessionSummary } from "@/types";

export default function SummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/complete`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setSummary(data.summary);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, [sessionId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="text-4xl mb-4">🪞</div>
          <p className="text-slate-400 animate-pulse">正在生成你的对话总结...</p>
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-slate-500">总结生成失败</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-slate-400 underline"
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center">
          <div className="text-4xl mb-3">🪞</div>
          <h1 className="text-2xl font-bold text-slate-900">你的对话总结</h1>
          <p className="mt-2 text-slate-500">这是小镜子为你整理的</p>
        </div>

        <div className="mt-8">
          <SummaryBlocks blocks={summary.blocks} />
        </div>

        <div className="mt-10">
          <FeedbackForm sessionId={sessionId} />
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/start"
            className="inline-flex items-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            再聊一次
          </Link>
          <div className="mt-3">
            <Link href="/" className="text-sm text-slate-400 underline">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
