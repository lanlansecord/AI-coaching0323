import { NextRequest, NextResponse } from "next/server";
import { interruptRealtimeVoiceChat } from "@/lib/voice/volc-realtime";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      roomId?: string;
      taskId?: string;
    };

    if (!payload.roomId || !payload.taskId) {
      return NextResponse.json(
        { error: "roomId and taskId are required" },
        { status: 400 }
      );
    }

    await interruptRealtimeVoiceChat({
      roomId: payload.roomId,
      taskId: payload.taskId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "UpdateVoiceChat 调用失败",
      },
      { status: 500 }
    );
  }
}
