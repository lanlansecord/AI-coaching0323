import OpenAI from "openai";

export interface GroqSttResult {
  text: string;
  raw?: unknown;
}

const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_STT_MODEL = "whisper-large-v3-turbo";

function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  return new OpenAI({
    apiKey,
    baseURL: DEFAULT_GROQ_BASE_URL,
  });
}

export async function transcribeGroq(audio: File): Promise<GroqSttResult> {
  const client = createGroqClient();
  const model = process.env.GROQ_STT_MODEL?.trim() || DEFAULT_GROQ_STT_MODEL;

  const response = await client.audio.transcriptions.create(
    {
      file: audio,
      model,
      language: "zh",
      temperature: 0,
    },
    {
      timeout: 60_000,
    }
  );

  return {
    text: typeof response.text === "string" ? response.text.trim() : "",
    raw: response,
  };
}
