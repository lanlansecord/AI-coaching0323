"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FeedbackFormProps {
  sessionId: string;
}

export function FeedbackForm({ sessionId }: FeedbackFormProps) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (helpful === null || submitting) return;
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = { helpful };
      if (helpful && text.trim()) {
        body.highlightText = text.trim();
      } else if (!helpful && text.trim()) {
        body.issueText = text.trim();
      }

      await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setSubmitted(true);
    } catch {
      alert("提交失败，但没关系");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-slate-50 p-6 text-center">
        <p className="text-lg">🙏</p>
        <p className="mt-2 text-slate-600">谢谢你的反馈</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50 p-6">
      <h3 className="mb-4 text-center font-medium text-slate-700">
        这次对话有帮助吗？
      </h3>

      <div className="flex justify-center gap-3">
        <button
          onClick={() => setHelpful(true)}
          className={`rounded-full px-5 py-2 text-sm transition-colors ${
            helpful === true
              ? "bg-green-100 text-green-700 ring-2 ring-green-300"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          👍 有帮助
        </button>
        <button
          onClick={() => setHelpful(false)}
          className={`rounded-full px-5 py-2 text-sm transition-colors ${
            helpful === false
              ? "bg-red-50 text-red-600 ring-2 ring-red-200"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          👎 没太大帮助
        </button>
      </div>

      {helpful !== null && (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              helpful
                ? "哪一句话让你印象最深？（可选）"
                : "哪里没对？（可选）"
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
          />
          <div className="mt-3 text-center">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              size="sm"
              className="rounded-full px-6"
            >
              {submitting ? "提交中..." : "提交反馈"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
