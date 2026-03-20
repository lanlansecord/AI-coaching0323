import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verificationCodes } from '@/lib/db/schema';
import { generateCode, sendSmsCode } from '@/lib/sms';
import { eq, and, gt } from 'drizzle-orm';

/**
 * POST /api/auth/send-code
 * Body: { phone: "13800138000" }
 * 发送短信验证码
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: '请输入正确的手机号' },
        { status: 400 }
      );
    }

    // 频率限制：同一手机号 60 秒内只能发一次
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCodes = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.phone, phone),
          gt(verificationCodes.createdAt, oneMinuteAgo)
        )
      );

    if (recentCodes.length > 0) {
      return NextResponse.json(
        { error: '验证码已发送，请 60 秒后再试' },
        { status: 429 }
      );
    }

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 分钟有效

    // 存入数据库
    await db.insert(verificationCodes).values({
      phone,
      code,
      expiresAt,
    });

    // 发送短信
    const sent = await sendSmsCode(phone, code);
    if (!sent) {
      return NextResponse.json(
        { error: '短信发送失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('Send code error:', error);
    return NextResponse.json(
      { error: '服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
