export type VoiceProvider = "browser-assist" | "doubao-realtime";

export function getRequestedVoiceProvider(): VoiceProvider {
  return process.env.NEXT_PUBLIC_VOICE_PROVIDER === "doubao-realtime"
    ? "doubao-realtime"
    : "browser-assist";
}

export function getVoiceProviderLabel(provider: VoiceProvider): string {
  return provider === "doubao-realtime"
    ? "豆包实时语音"
    : "兼容语音模式";
}
