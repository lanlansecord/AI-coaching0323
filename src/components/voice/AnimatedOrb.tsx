"use client";
import type { VoiceState } from "@/hooks/use-voice-chat";

interface AnimatedOrbProps {
  state: VoiceState;
  audioLevel?: number; // 0~1 实时音量
  onClick?: () => void;
}

/**
 * 动态光球组件 v2
 * - listening: 天蓝色，大小随音量跳动
 * - thinking: 紫色，快速脉动 + 旋转环
 * - speaking: 翠绿色，涟漪扩散 + 呼吸
 * - idle: 灰色静止
 */
export function AnimatedOrb({ state, audioLevel = 0, onClick }: AnimatedOrbProps) {
  // 音量驱动的缩放（listening 时使用）
  const volumeScale = state === "listening" ? 1 + audioLevel * 0.35 : 1;
  const volumeGlow = state === "listening" ? audioLevel : 0;

  const stateStyles = {
    idle: {
      bg: "bg-gradient-to-br from-slate-400 to-slate-500",
      glow: "shadow-slate-400/20",
      animation: "",
      ringColor: "",
    },
    listening: {
      bg: "bg-gradient-to-br from-sky-400 to-cyan-500",
      glow: "shadow-sky-400/40",
      animation: "", // 由音量驱动，不用 CSS 动画
      ringColor: "border-sky-400/30 border-t-sky-400",
    },
    thinking: {
      bg: "bg-gradient-to-br from-violet-400 to-indigo-400",
      glow: "shadow-violet-400/40",
      animation: "animate-voice-think",
      ringColor: "border-violet-400/30 border-t-violet-400",
    },
    speaking: {
      bg: "bg-gradient-to-br from-emerald-400 to-teal-400",
      glow: "shadow-emerald-400/40",
      animation: "animate-voice-breathe",
      ringColor: "",
    },
  };

  const s = stateStyles[state];

  return (
    <div
      className="relative flex items-center justify-center cursor-pointer select-none"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={
        state === "listening"
          ? "正在聆听"
          : state === "speaking"
          ? "点击打断"
          : "语音对话"
      }
    >
      {/* 涟漪（speaking） */}
      {state === "speaking" && (
        <>
          <div className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple" />
          <div className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple" style={{ animationDelay: "0.7s" }} />
          <div className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple" style={{ animationDelay: "1.4s" }} />
        </>
      )}

      {/* 音量涟漪（listening 且有声音时） */}
      {state === "listening" && audioLevel > 0.05 && (
        <>
          <div
            className="absolute w-28 h-28 md:w-40 md:h-40 rounded-full bg-sky-400/15 animate-voice-ripple"
            style={{ animationDuration: `${1.5 - audioLevel * 0.5}s` }}
          />
          <div
            className="absolute w-28 h-28 md:w-40 md:h-40 rounded-full bg-sky-400/10 animate-voice-ripple"
            style={{ animationDelay: "0.4s", animationDuration: `${1.5 - audioLevel * 0.5}s` }}
          />
        </>
      )}

      {/* 旋转环（thinking） */}
      {state === "thinking" && (
        <div className={`absolute w-36 h-36 md:w-48 md:h-48 rounded-full border-2 ${s.ringColor} animate-spin`} style={{ animationDuration: "1.5s" }} />
      )}

      {/* 外发光层 — 音量驱动 */}
      <div
        className={`absolute w-28 h-28 md:w-40 md:h-40 rounded-full ${s.bg} blur-xl ${s.animation}`}
        style={{
          opacity: state === "listening" ? 0.15 + volumeGlow * 0.3 : 0.2,
          transform: `scale(${volumeScale * 1.1})`,
          transition: "transform 0.08s ease-out, opacity 0.08s ease-out",
        }}
      />

      {/* 中间发光层 */}
      <div
        className={`absolute w-24 h-24 md:w-36 md:h-36 rounded-full ${s.bg} blur-md ${s.animation}`}
        style={{
          opacity: state === "listening" ? 0.2 + volumeGlow * 0.2 : 0.3,
          transform: `scale(${volumeScale * 1.05})`,
          transition: "transform 0.08s ease-out, opacity 0.08s ease-out",
          animationDelay: "0.15s",
        }}
      />

      {/* 核心光球 */}
      <div
        className={`relative w-20 h-20 md:w-32 md:h-32 rounded-full ${s.bg} shadow-2xl ${s.glow} ${s.animation} transition-colors duration-500`}
        style={{
          transform: `scale(${volumeScale})`,
          transition: state === "listening"
            ? "transform 0.08s ease-out, colors 0.5s"
            : "transform 0.3s ease-out, colors 0.5s",
        }}
      >
        {/* 内部高光 */}
        <div className="absolute inset-2 rounded-full bg-white/20 blur-sm" />
        <div className="absolute top-3 left-3 w-4 h-4 md:w-6 md:h-6 rounded-full bg-white/30 blur-sm" />

        {/* 中心图标 */}
        <div className="absolute inset-0 flex items-center justify-center">
          {state === "listening" && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 md:w-8 md:h-8">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          )}
          {state === "thinking" && (
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          )}
          {state === "speaking" && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 md:w-8 md:h-8">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
