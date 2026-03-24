const DEFAULT_FUNASR_SERVICE_URL = "http://127.0.0.1:7861";

export interface FunAsrResult {
  text: string;
  raw?: unknown;
}

export async function transcribeFunAsr(audio: File): Promise<FunAsrResult> {
  const baseUrl =
    process.env.FUNASR_SERVICE_URL?.trim() || DEFAULT_FUNASR_SERVICE_URL;

  const formData = new FormData();
  formData.append("audio", audio, audio.name || "voice-input.wav");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${baseUrl}/transcribe`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : typeof data?.error === "string"
            ? data.error
            : `FunASR request failed (${response.status})`;
      throw new Error(detail);
    }

    return {
      text: typeof data?.text === "string" ? data.text.trim() : "",
      raw: data?.raw,
    };
  } finally {
    clearTimeout(timeout);
  }
}
