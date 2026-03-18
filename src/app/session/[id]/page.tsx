"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatContainer } from "@/components/session/ChatContainer";
import { useChat } from "@/hooks/use-chat";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { messages, isStreaming, sendMessage, initMessages } = useChat(sessionId);
  const [loaded, setLoaded] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Load initial messages from session
  useEffect(() => {
    async function loadSession() {
      try {
        // For now, we get the session data from the API
        // The opening message was already created when session was made
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        if (res.ok) {
          const data = await res.json();
          initMessages(
            data.messages.map((m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      } catch {
        // Fallback: session might be new
      } finally {
        setLoaded(true);
      }
    }

    loadSession();
  }, [sessionId, initMessages]);

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

  if (!loaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <p className="text-slate-400 animate-pulse">加载中...</p>
      </div>
    );
  }

  return (
    <ChatContainer
      messages={messages}
      isStreaming={isStreaming}
      onSend={sendMessage}
      onEndSession={handleEndSession}
      isEnding={isEnding}
    />
  );
}
