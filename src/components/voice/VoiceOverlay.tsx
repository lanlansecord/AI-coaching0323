"use client";
import { useEffect, useState, useRef } from "react";
import { AnimatedOrb } from "./AnimatedOrb";
import type { VoiceState } from "@/hooks/use-voice-chat";

interface VoiceOverlayProps {
  voiceState: VoiceState;
  currentTranscript: string;
  displayText: string;
  interim: string;
  audioLevel: number;
  turnCount: number;
  onClose: () => void;
  onInterrupt: () => void;
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "",
  listening: "正在聆听",
  thinking: "思考中",
  speaking: "正在回复",
};

/**
 * 全屏语音对话覆盖层 v2
 * - 音量响应式光球
 * - 轮次计数
 * - 渐现字幕
 * - listening 时点击光球可手动结束录音发送
 */
export function VoiceOverlay({
  voiceState,
  currentTranscript,
  displayText,
  interim,
  audioLevel,
  turnCount,
  onClose,
  onInterrupt,
}: VoiceOverlayProps) {
  const [visible, setVisible] = useState(false);
  const subtitleRef = useRef<HTMLDivElement>(null);

  // 入场动画
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // 字幕自动滚动到底部
  useEffect(() => {
    if (subtitleRef.current) {
      subtitleRef.current.scrollTop = subtitleRef.current.scrollHeight;
    }
  }, [displayText, currentTranscript, interim]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleOrbClick = () => {
    if (voiceState === "speaking") {
      onInterrupt();
    }
  };

  // 字幕内容
  const getSubtitle = () => {
    if (voiceState === "listening") {
      const text = currentTranscript || interim;
      return text ? (
        <span className="text-white/90 animate-fade-in">{text}</span>
      ) : (
        <span className="text-white/40">说点什么吧...</span>
      );
    }
    if (voiceState === "thinking") {
      return (
        <span className="text-violet-300/70">
          <span className="inline-block animate-pulse">正在组织回复</span>
          <span className="inline-flex ml-1">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "200ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "400ms" }}>.</span>
          </span>
        </span>
      );
    }
    if (voiceState === "speaking" && displayText) {
      const truncated =
        displayText.length > 200
          ? "..." + displayText.slice(-200)
          : displayText;
      return <span className="text-emerald-200/90">{truncated}</span>;
    }
    return null;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        background: "radial-gradient(ellipse at center, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.98) 100%)",
      }}
    >
      {/* 顶部栏 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 safe-area-top">
        <div className="flex items-center gap-2">
          <span className="text-lg">🪞</span>
          <span className="text-white/50 text-xs font-light tracking-wider">
            语音模式
          </span>
          {turnCount > 0 && (
            <span className="text-white/30 text-[11px] ml-1">
              第 {turnCount} 轮
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors"
          aria-label="关闭语音模式"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* 光球 */}
      <div className="flex-1 flex items-center justify-center -mt-8">
        <AnimatedOrb
          state={voiceState}
          audioLevel={audioLevel}
          onClick={handleOrbClick}
        />
      </div>

      {/* 底部信息区 */}
      <div className="w-full px-6 pb-8 safe-area-bottom">
        {/* 状态标签 */}
        <div className="text-center mb-2.5">
          <span
            className={`inline-flex items-center gap-2 text-xs font-medium tracking-wide transition-colors duration-300 ${
              voiceState === "listening"
                ? "text-sky-400"
                : voiceState === "thinking"
                ? "text-violet-400"
                : voiceState === "speaking"
                ? "text-emerald-400"
                : "text-white/30"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                voiceState === "listening"
                  ? "bg-sky-400"
                  : voiceState === "thinking"
                  ? "bg-violet-400"
                  : voiceState === "speaking"
                  ? "bg-emerald-400"
                  : "bg-white/30"
              } ${voiceState !== "idle" ? "animate-pulse" : ""}`}
            />
            {STATE_LABELS[voiceState]}
          </span>
        </div>

        {/* 字幕文本 */}
        <div
          ref={subtitleRef}
          className="min-h-[2.5rem] max-h-[5rem] overflow-y-auto text-center text-sm leading-relaxed px-4 scrollbar-hide"
        >
          {getSubtitle()}
        </div>

        {/* 操作提示 */}
        <div className="text-center mt-3 h-4">
          {voiceState === "speaking" && (
            <p className="text-white/25 text-[11px] animate-fade-in">
              点击光球可打断
            </p>
          )}
          {voiceState === "listening" && !currentTranscript && !interim && (
            <p className="text-white/20 text-[11px]">
              对着手机说话，我在听
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
