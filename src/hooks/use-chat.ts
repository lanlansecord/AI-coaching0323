"use client";

import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  inputMode?: "text" | "voice";
  audioUrl?: string;
  audioDurationMs?: number;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const pendingChunkRef = useRef("");

  const initMessages = useCallback((initialMessages: ChatMessage[]) => {
    setMessages(initialMessages);
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        inputMode?: "text" | "voice";
        audioUrl?: string;
        audioDurationMs?: number;
      }
    ) => {
      const trimmedContent = content.trim();
      if (isStreaming || !trimmedContent) return;

      // Add user message optimistically
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmedContent,
        inputMode: options?.inputMode || "text",
        audioUrl: options?.audioUrl,
        audioDurationMs: options?.audioDurationMs,
      };

      // Add placeholder for assistant
      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch(`/api/sessions/${sessionId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmedContent,
            inputMode: options?.inputMode || "text",
            audioUrl: options?.audioUrl,
            audioDurationMs: options?.audioDurationMs,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) throw new Error("Chat request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let isDone = false;

        const flushPendingChunk = () => {
          if (!pendingChunkRef.current) return;

          const nextChunk = pendingChunkRef.current;
          pendingChunkRef.current = "";

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + nextChunk }
                : message
            )
          );
        };

        const clearFlushTimer = () => {
          if (flushTimerRef.current !== null) {
            window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
        };

        const scheduleFlush = () => {
          if (flushTimerRef.current !== null) return;

          flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null;
            flushPendingChunk();
          }, 40);
        };

        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                isDone = true;
                clearFlushTimer();
                flushPendingChunk();
                break;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  pendingChunkRef.current += parsed.content;
                  scheduleFlush();
                }
              } catch {
                // Skip malformed data
              }
            }
          }
        }

        clearFlushTimer();
        flushPendingChunk();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || "抱歉，出了点问题，请重试。" }
                : m
            )
          );
        }
      } finally {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        pendingChunkRef.current = "";
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, isStreaming]
  );

  const appendMessage = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${message.role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...message,
      },
    ]);
  }, []);

  return { messages, isStreaming, sendMessage, initMessages, appendMessage };
}
