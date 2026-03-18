export function SafetyNotice() {
  return (
    <div className="mt-12 rounded-lg bg-slate-50 px-5 py-4 text-center text-sm leading-relaxed text-slate-400">
      <p>
        小镜子是 AI 对话工具，不提供心理诊断或治疗建议。
        <br />
        如果你正处于心理危机中，请立即拨打{" "}
        <a href="tel:400-161-9995" className="underline">
          400-161-9995
        </a>{" "}
        （全国心理援助热线）。
      </p>
    </div>
  );
}
