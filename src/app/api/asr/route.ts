import { NextRequest, NextResponse } from "next/server";
import { transcribeFunAsr } from "@/lib/voice/funasr";
import { transcribeGroq } from "@/lib/voice/groq-stt";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const serviceUrl =
    process.env.FUNASR_SERVICE_URL?.trim() || "http://127.0.0.1:7861";

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (!audio.size) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    if (!groqApiKey && !serviceUrl) {
      return NextResponse.json(
        { error: "No ASR provider configured" },
        { status: 500 }
      );
    }

    const result = groqApiKey
      ? await transcribeGroq(audio)
      : await transcribeFunAsr(audio);

    return NextResponse.json(result);
  } catch (error) {
    console.error("ASR request failed:", error);
    return NextResponse.json(
      { error: "ASR request failed", detail: String(error) },
      { status: 500 }
    );
  }
}
