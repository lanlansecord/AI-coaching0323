import { NextRequest, NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/auth";
import {
  createRealtimeSessionConnection,
  getVolcRealtimeStatus,
} from "@/lib/voice/volc-realtime";

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = (await request.json()) as { sessionId?: string };

    if (!sessionId?.trim()) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const status = getVolcRealtimeStatus();
    if (!status.ready) {
      return NextResponse.json(status);
    }

    const identity = await getCurrentIdentity();
    const identityId = identity.userId || identity.guestId || sessionId;

    const connection = await createRealtimeSessionConnection({
      sessionId,
      identityId,
    });

    return NextResponse.json({
      ready: true,
      connection,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        reason: error instanceof Error ? error.message : "创建实时语音会话失败",
      },
      { status: 500 }
    );
  }
}
