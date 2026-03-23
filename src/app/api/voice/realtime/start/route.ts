import { NextRequest, NextResponse } from "next/server";
import {
  type RealtimeSessionConnection,
  startRealtimeVoiceChat,
} from "@/lib/voice/volc-realtime";

export async function POST(request: NextRequest) {
  try {
    const { connection } = (await request.json()) as {
      connection?: RealtimeSessionConnection;
    };

    if (!connection) {
      return NextResponse.json({ error: "connection is required" }, { status: 400 });
    }

    const result = await startRealtimeVoiceChat(connection);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "StartVoiceChat 调用失败",
      },
      { status: 500 }
    );
  }
}
