"use client";

import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useAutoScroll } from "@/hooks/use-scroll";
import type { ChatMessage as ChatMessageType } from "@/hooks/use-chat";

interface ChatContainerProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onEndSession: () => void;
  isEnding: boolean;
}

export function ChatContainer({
  messages,
  isStreaming,
  onSend,
  onEndSession,
  isEnding,
}: ChatContainerProps) {
  const scrollRef = useAutoScroll([messages]);

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🪞</span>
          <span className="font-medium text-slate-900">小镜子</span>
        </div>
        <button
          onClick={onEndSession}
          disabled={isEnding || isStreaming}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          {isEnding ? "正在总结..." : "结束对话"}
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
          ))}
        </div>
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} disabled={isStreaming || isEnding} />
    </div>
  );
}
