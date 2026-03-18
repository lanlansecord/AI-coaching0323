import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
          isUser
            ? "bg-slate-900 text-white"
            : "bg-slate-100 text-slate-800"
        )}
      >
        {content ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
          </span>
        )}
      </div>
    </div>
  );
}
