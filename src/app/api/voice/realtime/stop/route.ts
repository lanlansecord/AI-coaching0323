import { NextRequest, NextResponse } from "next/server";
import {
  type RealtimeSessionConnection,
  stopRealtimeVoiceChat,
} from "@/lib/voice/volc-realtime";

export async function POST(request: NextRequest) {
  try {
    const { connection } = (await request.json()) as {
      connection?: RealtimeSessionConnection;
    };

    if (!connection) {
      return NextResponse.json({ error: "connection is required" }, { status: 400 });
    }

    await stopRealtimeVoiceChat(connection);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "StopVoiceChat 调用失败",
      },
      { status: 500 }
    );
  }
}
