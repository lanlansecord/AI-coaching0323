import { Card, CardContent } from "@/components/ui/card";
import type { SummaryBlock } from "@/types";

interface SummaryBlocksProps {
  blocks: SummaryBlock[];
}

export function SummaryBlocks({ blocks }: SummaryBlocksProps) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <Card key={block.key || index} className="border-slate-200">
          <CardContent className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-500">
              {block.title}
            </h3>
            <p className="text-base leading-relaxed text-slate-800">
              {block.content}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
