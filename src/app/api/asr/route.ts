import { NextRequest, NextResponse } from "next/server";
import { transcribeWithGroq } from "@/lib/asr/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    const text = await transcribeWithGroq(file);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("ASR error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
