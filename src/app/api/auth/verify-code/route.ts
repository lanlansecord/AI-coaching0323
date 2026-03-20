import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, verificationCodes, sessions } from '@/lib/db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { signIn } from '@/lib/auth';
import { getGuestId } from '@/lib/guest';

/**
 * POST /api/auth/verify-code
 * Body: { phone: "13800138000", code: "123456" }
 * 验证短信码 → 登录/注册 → 迁移匿名数据
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { error: '请输入手机号和验证码' },
        { status: 400 }
      );
    }

    // 查找有效验证码
    const now = new Date();
    const [validCode] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.phone, phone),
          eq(verificationCodes.code, code),
          eq(verificationCodes.used, false),
          gt(verificationCodes.expiresAt, now)
        )
      )
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!validCode) {
      return NextResponse.json(
        { error: '验证码错误或已过期' },
        { status: 400 }
      );
    }

    // 标记验证码已使用
    await db
      .update(verificationCodes)
      .set({ used: true })
      .where(eq(verificationCodes.id, validCode.id));

    // 查找或创建用户
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) {
      // 新用户注册
      const [newUser] = await db
        .insert(users)
        .values({
          phone,
          phoneVerified: true,
          displayName: `用户${phone.slice(-4)}`, // 默认昵称：手机尾号
        })
        .returning();
      user = newUser;
    } else {
      // 已有用户，更新 verified 状态
      await db
        .update(users)
        .set({ phoneVerified: true, updatedAt: now })
        .where(eq(users.id, user.id));
    }

    // 迁移匿名 guest 的历史对话到该用户
    const guestId = await getGuestId();
    if (guestId) {
      await db
        .update(sessions)
        .set({ userId: user.id })
        .where(
          and(
            eq(sessions.guestId, guestId),
            eq(sessions.userId, undefined as unknown as string) // userId IS NULL
          )
        )
        .catch(() => {
          // 忽略迁移失败（可能已迁移）
        });

      // 用 raw SQL 处理 NULL 比较
      await db.execute(
        `UPDATE sessions SET user_id = '${user.id}' WHERE guest_id = '${guestId}' AND user_id IS NULL`
      );
    }

    // 签发 JWT
    await signIn({
      userId: user.id,
      phone: user.phone!,
      displayName: user.displayName || undefined,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json(
      { error: '验证失败，请重试' },
      { status: 500 }
    );
  }
}
