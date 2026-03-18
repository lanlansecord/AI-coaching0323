import { ENTRY_TAG_LABELS, ENTRY_TAG_DESCRIPTIONS, ENTRY_TAG_ICONS } from "@/types";
import type { EntryTag } from "@/types";
import { Card, CardContent } from "@/components/ui/card";

const tags: EntryTag[] = ['clarity', 'emotion', 'procrastination'];

export function TagCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tags.map((tag) => (
        <Card
          key={tag}
          className="group cursor-default border-slate-200 transition-colors hover:border-slate-300"
        >
          <CardContent className="p-5 text-center">
            <div className="mb-3 text-3xl">{ENTRY_TAG_ICONS[tag]}</div>
            <h3 className="text-base font-semibold text-slate-900">
              {ENTRY_TAG_LABELS[tag]}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {ENTRY_TAG_DESCRIPTIONS[tag]}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
