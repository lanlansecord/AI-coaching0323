"use client";
import type { VoiceState } from "@/hooks/use-voice-chat";

interface AnimatedOrbProps {
  state: VoiceState;
  onClick?: () => void;
}

/**
 * 动态光球组件
 * 四种状态对应不同颜色和动画：
 * - idle: 灰色，无动画
 * - listening: 天蓝→青，缓慢呼吸脉动
 * - thinking: 紫→靛，快速脉动 + 外环旋转
 * - speaking: 翠绿→青，声波涟漪扩散
 */
export function AnimatedOrb({ state, onClick }: AnimatedOrbProps) {
  const stateStyles = {
    idle: {
      bg: "bg-gradient-to-br from-slate-400 to-slate-500",
      glow: "shadow-slate-400/20",
      animation: "",
    },
    listening: {
      bg: "bg-gradient-to-br from-sky-400 to-cyan-500",
      glow: "shadow-sky-400/40",
      animation: "animate-voice-breathe",
    },
    thinking: {
      bg: "bg-gradient-to-br from-violet-400 to-indigo-400",
      glow: "shadow-violet-400/40",
      animation: "animate-voice-think",
    },
    speaking: {
      bg: "bg-gradient-to-br from-emerald-400 to-teal-400",
      glow: "shadow-emerald-400/40",
      animation: "animate-voice-breathe",
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
          ? "正在聆听，点击打断"
          : state === "speaking"
          ? "正在说话，点击打断"
          : "语音对话"
      }
    >
      {/* 声波涟漪（speaking 状态） */}
      {state === "speaking" && (
        <>
          <div className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple" />
          <div
            className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple"
            style={{ animationDelay: "0.5s" }}
          />
          <div
            className="absolute w-32 h-32 md:w-44 md:h-44 rounded-full bg-emerald-400/10 animate-voice-ripple"
            style={{ animationDelay: "1s" }}
          />
        </>
      )}

      {/* 外环旋转（thinking 状态） */}
      {state === "thinking" && (
        <div className="absolute w-36 h-36 md:w-48 md:h-48 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
      )}

      {/* 外发光层 */}
      <div
        className={`absolute w-28 h-28 md:w-40 md:h-40 rounded-full ${s.bg} opacity-20 blur-xl ${s.animation}`}
      />

      {/* 中间发光层 */}
      <div
        className={`absolute w-24 h-24 md:w-36 md:h-36 rounded-full ${s.bg} opacity-30 blur-md ${s.animation}`}
        style={{ animationDelay: "0.15s" }}
      />

      {/* 核心光球 */}
      <div
        className={`relative w-20 h-20 md:w-32 md:h-32 rounded-full ${s.bg} shadow-2xl ${s.glow} ${s.animation} transition-colors duration-500`}
      >
        {/* 内部高光 */}
        <div className="absolute inset-2 rounded-full bg-white/20 blur-sm" />
        <div className="absolute top-3 left-3 w-4 h-4 md:w-6 md:h-6 rounded-full bg-white/30 blur-sm" />
      </div>
    </div>
  );
}
