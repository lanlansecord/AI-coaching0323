"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 发送验证码
  async function handleSendCode() {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "发送失败");
        return;
      }

      setStep("code");
      setCountdown(60);
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  // 验证登录
  async function handleVerify() {
    if (code.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "验证失败");
        return;
      }

      // 登录成功，跳转首页
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  // 重新发送
  async function handleResend() {
    if (countdown > 0) return;
    setCode("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "发送失败");
      } else {
        setCountdown(60);
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">🪞</div>
        <h1 className="text-xl font-bold text-slate-900">小镜子</h1>
        <p className="text-sm text-slate-400 mt-1">照见你的潜意识</p>
      </div>

      {/* 卡片 */}
      <div className="w-full max-w-sm">
        {step === "phone" ? (
          /* 手机号输入 */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                手机号登录
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  +86
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 11));
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                  placeholder="请输入手机号"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pl-12 text-[15px] placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-0"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <button
              onClick={handleSendCode}
              disabled={loading || phone.length !== 11}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
            >
              {loading ? "发送中..." : "获取验证码"}
            </button>
          </div>
        ) : (
          /* 验证码输入 */
          <div className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-sm text-slate-500">
                验证码已发送至{" "}
                <span className="font-medium text-slate-700">
                  {phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}
                </span>
              </p>
            </div>

            <div>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg tracking-[0.5em] placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm focus:border-slate-300 focus:outline-none focus:ring-0"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
            >
              {loading ? "验证中..." : "登录"}
            </button>

            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError("");
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                ← 修改手机号
              </button>
              <button
                onClick={handleResend}
                disabled={countdown > 0}
                className="text-slate-500 hover:text-slate-700 disabled:text-slate-300"
              >
                {countdown > 0 ? `${countdown}s 后重新发送` : "重新发送"}
              </button>
            </div>
          </div>
        )}

        {/* 底部 */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            暂不登录，继续使用
          </button>
          <p className="mt-3 text-[11px] text-slate-300 leading-relaxed">
            登录后对话记录可跨设备同步
            <br />
            未登录的历史对话将自动关联到你的账号
          </p>
        </div>
      </div>
    </div>
  );
}
