import { NextResponse } from "next/server";
import { getVolcRealtimeStatus } from "@/lib/voice/volc-realtime";

export async function GET() {
  try {
    return NextResponse.json(getVolcRealtimeStatus());
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        missing: [],
        reason: error instanceof Error ? error.message : "实时语音配置读取失败",
      },
      { status: 500 }
    );
  }
}
