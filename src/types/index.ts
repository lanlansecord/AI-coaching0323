export type EntryTag = 'clarity' | 'emotion' | 'procrastination';

export const ENTRY_TAG_LABELS: Record<EntryTag, string> = {
  clarity: '理清思路',
  emotion: '梳理情绪',
  procrastination: '走出拖延',
};

export const ENTRY_TAG_DESCRIPTIONS: Record<EntryTag, string> = {
  clarity: '当脑子里装了太多东西，想把混乱的想法理出头绪',
  emotion: '当心里有些沉甸甸的东西，想被看见、被听到',
  procrastination: '当你知道该做却迟迟动不了，想找到那个卡住你的点',
};

export const ENTRY_TAG_ICONS: Record<EntryTag, string> = {
  clarity: '🧠',
  emotion: '💛',
  procrastination: '🚀',
};

export interface SummaryBlock {
  key: string;
  title: string;
  content: string;
}

export interface SessionSummary {
  blocks: SummaryBlock[];
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  guestId: string;
  entryTag: EntryTag | null;
  status: 'active' | 'completed';
  summaryJson: SessionSummary | null;
  createdAt: Date;
  lastMessageAt: Date;
}
