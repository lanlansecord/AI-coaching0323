import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * 豆包 TTS HTTP API 代理
 * POST /api/tts
 * Body: { text: string }
 * Returns: audio/mpeg binary stream
 */
export async function POST(request: NextRequest) {
  const { text } = await request.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  const appId = process.env.VOLC_TTS_APP_ID;
  const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN;

  if (!appId || !accessToken) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 500 });
  }

  try {
    const reqId = uuidv4();
    const payload = {
      app: {
        appid: appId,
        token: accessToken,
        cluster: 'volcano_tts',
      },
      user: {
        uid: 'xiaojingzi-user',
      },
      audio: {
        voice_type: 'zh_female_shuangkuaisisi_moon_bigtts', // 温柔女声
        encoding: 'mp3',
        speed_ratio: 1.0,
        volume_ratio: 1.0,
        pitch_ratio: 1.0,
      },
      request: {
        reqid: reqId,
        text: text.trim(),
        text_type: 'plain',
        operation: 'query',
      },
    };

    const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('TTS API error:', res.status, errorText);
      return NextResponse.json(
        { error: 'TTS API failed', detail: errorText },
        { status: 502 }
      );
    }

    const data = await res.json();

    // 豆包 TTS 返回 base64 编码的音频数据
    if (data.data) {
      const audioBuffer = Buffer.from(data.data, 'base64');
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(audioBuffer.length),
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 可能的错误响应
    if (data.code && data.code !== 3000) {
      console.error('TTS error response:', data);
      return NextResponse.json(
        { error: 'TTS synthesis failed', code: data.code, message: data.message },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: 'No audio data returned' }, { status: 502 });
  } catch (error) {
    console.error('TTS request failed:', error);
    return NextResponse.json(
      { error: 'TTS request failed', detail: String(error) },
      { status: 500 }
    );
  }
}
