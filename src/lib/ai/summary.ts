import type { EntryTag } from '@/types';

const SUMMARY_STRUCTURES: Record<EntryTag, { blocks: { key: string; title: string }[] }> = {
  clarity: {
    blocks: [
      { key: 'core_question', title: '我现在最核心的问题' },
      { key: 'real_focus', title: '我真正想厘清的点' },
      { key: 'next_action', title: '下一步一个判断动作' },
    ],
  },
  emotion: {
    blocks: [
      { key: 'strongest_emotion', title: '我此刻最强烈的情绪' },
      { key: 'underlying_need', title: '情绪背后的需要' },
      { key: 'self_care', title: '今天可以怎么照顾自己' },
    ],
  },
  procrastination: {
    blocks: [
      { key: 'avoidance', title: '我在逃避什么' },
      { key: 'core_resistance', title: '真正卡住我的阻力' },
      { key: 'smallest_action', title: '下一步最小动作' },
    ],
  },
};

export function buildSummaryPrompt(tag: EntryTag, conversationText: string): string {
  const structure = SUMMARY_STRUCTURES[tag];
  const blockDescriptions = structure.blocks
    .map((b, i) => `${i + 1}. "${b.title}"（key: "${b.key}"）`)
    .join('\n');

  return `你是"小镜子"的总结生成模块。请根据以下对话内容，生成一份三段式总结。

## 总结结构
${blockDescriptions}

## 要求
- 每个 block 的 content 用 1-3 句话概括，使用第一人称"我"的视角
- 语言温暖、简洁、具体，不要空泛
- 如果对话中某个维度没有明确提到，基于对话推断一个合理的内容，但不要编造用户没说过的事实
- 输出严格按照 JSON 格式，不要包含其他文字

## 输出格式
\`\`\`json
{
  "blocks": [
    { "key": "${structure.blocks[0].key}", "title": "${structure.blocks[0].title}", "content": "..." },
    { "key": "${structure.blocks[1].key}", "title": "${structure.blocks[1].title}", "content": "..." },
    { "key": "${structure.blocks[2].key}", "title": "${structure.blocks[2].title}", "content": "..." }
  ]
}
\`\`\`

## 对话内容
${conversationText}`;
}

export function getSummaryStructure(tag: EntryTag) {
  return SUMMARY_STRUCTURES[tag];
}
