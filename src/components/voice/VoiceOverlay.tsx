"use client";
import { useEffect, useState } from "react";
import { AnimatedOrb } from "./AnimatedOrb";
import type { VoiceState } from "@/hooks/use-voice-chat";

interface VoiceOverlayProps {
  voiceState: VoiceState;
  currentTranscript: string;
  displayText: string;
  interim: string;
  onClose: () => void;
  onInterrupt: () => void;
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "",
  listening: "正在聆听...",
  thinking: "思考中...",
  speaking: "正在回复...",
};

/**
 * 全屏语音对话覆盖层
 * 深色背景 + 动态光球 + 字幕 + 状态文字
 */
export function VoiceOverlay({
  voiceState,
  currentTranscript,
  displayText,
  interim,
  onClose,
  onInterrupt,
}: VoiceOverlayProps) {
  const [visible, setVisible] = useState(false);

  // 入场动画
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

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
        <span className="text-white/90">{text}</span>
      ) : (
        <span className="text-white/50">说点什么吧...</span>
      );
    }
    if (voiceState === "thinking") {
      return <span className="text-violet-300/80">正在组织回复...</span>;
    }
    if (voiceState === "speaking" && displayText) {
      // 只显示最后 200 个字符，避免太长
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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 关闭按钮 */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="关闭语音模式"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/70"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {/* 标题 */}
      <div className="absolute top-8 left-0 right-0 text-center">
        <h2 className="text-white/60 text-sm font-light tracking-wider">
          小镜子 · 语音模式
        </h2>
      </div>

      {/* 光球 */}
      <div className="flex-1 flex items-center justify-center">
        <AnimatedOrb state={voiceState} onClick={handleOrbClick} />
      </div>

      {/* 字幕区 */}
      <div className="w-full px-8 pb-8">
        {/* 状态标签 */}
        <div className="text-center mb-3">
          <span
            className={`inline-flex items-center gap-2 text-xs font-medium tracking-wide ${
              voiceState === "listening"
                ? "text-sky-400"
                : voiceState === "thinking"
                ? "text-violet-400"
                : voiceState === "speaking"
                ? "text-emerald-400"
                : "text-white/40"
            }`}
          >
            {voiceState === "listening" && (
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            )}
            {voiceState === "thinking" && (
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            )}
            {voiceState === "speaking" && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {STATE_LABELS[voiceState]}
          </span>
        </div>

        {/* 字幕文本 */}
        <div className="min-h-[3rem] max-h-[6rem] overflow-y-auto text-center text-sm leading-relaxed px-4">
          {getSubtitle()}
        </div>

        {/* 操作提示 */}
        <div className="text-center mt-4">
          {voiceState === "speaking" && (
            <p className="text-white/30 text-xs">点击光球可打断</p>
          )}
        </div>
      </div>
    </div>
  );
}
