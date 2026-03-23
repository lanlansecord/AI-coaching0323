import OpenAI from "openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

let groqClient: OpenAI | null = null;

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable is required");
  }

  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: GROQ_BASE_URL,
    });
  }

  return groqClient;
}

export async function transcribeWithGroq(file: File) {
  const client = getGroqClient();
  const model = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    language: "zh",
    response_format: "verbose_json",
    temperature: 0,
  });

  return transcription.text?.trim() || "";
}
