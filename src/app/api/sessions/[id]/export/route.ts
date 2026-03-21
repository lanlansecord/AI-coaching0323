import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
} from 'docx';

const TAG_LABELS: Record<string, string> = {
  clarity: '理清思路',
  emotion: '梳理情绪',
  procrastination: '走出拖延',
  general: '自由对话',
};

/**
 * GET /api/sessions/[id]/export?format=docx
 * 导出对话记录为 Word 文档
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const format = request.nextUrl.searchParams.get('format') || 'docx';

  try {
    // 获取会话信息
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 获取所有消息
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    if (format === 'docx') {
      return generateDocx(session, allMessages);
    }

    // 纯文本格式作为 fallback
    return generateText(session, allMessages);
  } catch (error) {
    console.error('Export failed:', error);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    );
  }
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function generateDocx(
  session: typeof sessions.$inferSelect,
  allMessages: (typeof messages.$inferSelect)[]
) {
  const tagLabel = TAG_LABELS[session.entryTag] || session.entryTag;
  const dateStr = formatDate(session.createdAt);

  const children: Paragraph[] = [];

  // 标题
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: '🪞 小镜子 · 对话记录', size: 36, bold: true }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // 元信息
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `主题：${tagLabel}　　时间：${dateStr}　　状态：${session.status === 'completed' ? '已完成' : '进行中'}`, size: 20, color: '666666' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // 分割线
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      },
      spacing: { after: 300 },
    })
  );

  // 对话消息
  for (const msg of allMessages) {
    if (msg.role === 'system') continue;

    const isUser = msg.role === 'user';
    const label = isUser ? '我' : '小镜子';
    const time = formatDate(msg.createdAt);

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${label}`,
            bold: true,
            size: 22,
            color: isUser ? '1E293B' : '0D9488',
          }),
          new TextRun({
            text: `　${time}`,
            size: 16,
            color: '999999',
          }),
        ],
        spacing: { before: 200 },
      })
    );

    // 消息内容（支持多段落）
    const paragraphs = msg.content.split('\n').filter(Boolean);
    for (const para of paragraphs) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: para, size: 21 }),
          ],
          spacing: { after: 80 },
          indent: { left: 200 },
        })
      );
    }
  }

  // 如果有总结
  if (session.summaryJson) {
    const summary = session.summaryJson as { blocks: { title: string; content: string }[] };
    if (summary.blocks?.length) {
      children.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          },
          spacing: { before: 400, after: 300 },
        })
      );

      children.push(
        new Paragraph({
          text: '对话总结',
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        })
      );

      for (const block of summary.blocks) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: block.title, bold: true, size: 22 }),
            ],
            spacing: { before: 150 },
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: block.content, size: 21 }),
            ],
            spacing: { after: 100 },
            indent: { left: 200 },
          })
        );
      }
    }
  }

  // 页脚
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: '\n\n由「小镜子」AI 生活教练生成', size: 16, color: 'AAAAAA' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const uint8 = new Uint8Array(buffer);

  const filename = `小镜子-${tagLabel}-${new Date(session.createdAt).toISOString().slice(0, 10)}.docx`;

  return new NextResponse(uint8, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(uint8.length),
    },
  });
}

function generateText(
  session: typeof sessions.$inferSelect,
  allMessages: (typeof messages.$inferSelect)[]
) {
  const tagLabel = TAG_LABELS[session.entryTag] || session.entryTag;
  const lines: string[] = [];

  lines.push('🪞 小镜子 · 对话记录');
  lines.push(`主题：${tagLabel}　时间：${formatDate(session.createdAt)}`);
  lines.push('─'.repeat(40));
  lines.push('');

  for (const msg of allMessages) {
    if (msg.role === 'system') continue;
    const label = msg.role === 'user' ? '我' : '小镜子';
    lines.push(`【${label}】 ${formatDate(msg.createdAt)}`);
    lines.push(msg.content);
    lines.push('');
  }

  const text = lines.join('\n');
  const filename = `小镜子-${tagLabel}-${new Date(session.createdAt).toISOString().slice(0, 10)}.txt`;

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
