"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTRY_TAG_LABELS, ENTRY_TAG_DESCRIPTIONS, ENTRY_TAG_ICONS } from "@/types";
import type { EntryTag } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { SafetyNotice } from "@/components/landing/SafetyNotice";

const tags: EntryTag[] = ["clarity", "emotion", "procrastination"];

export default function StartPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<EntryTag | null>(null);

  async function handleSelectTag(tag: EntryTag) {
    if (loading) return;
    setLoading(tag);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryTag: tag }),
      });

      if (!res.ok) throw new Error("Failed to create session");

      const data = await res.json();
      router.push(`/session/${data.sessionId}`);
    } catch {
      setLoading(null);
      alert("创建会话失败，请稍后重试");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <div className="text-center">
          <div className="mb-4 text-4xl">🪞</div>
          <h1 className="text-2xl font-bold text-slate-900">
            你今天想聊什么？
          </h1>
          <p className="mt-2 text-slate-500">
            选一个方向，我们就开始
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {tags.map((tag) => (
            <Card
              key={tag}
              onClick={() => handleSelectTag(tag)}
              className={`cursor-pointer border-2 transition-all ${
                loading === tag
                  ? "border-slate-900 bg-slate-50"
                  : "border-transparent hover:border-slate-300 hover:shadow-md"
              } ${loading && loading !== tag ? "opacity-50" : ""}`}
            >
              <CardContent className="p-6 text-center">
                <div className="mb-3 text-4xl">{ENTRY_TAG_ICONS[tag]}</div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {ENTRY_TAG_LABELS[tag]}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {ENTRY_TAG_DESCRIPTIONS[tag]}
                </p>
                {loading === tag && (
                  <p className="mt-3 text-sm text-slate-400 animate-pulse">
                    正在准备...
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <SafetyNotice />
      </div>
    </main>
  );
}
