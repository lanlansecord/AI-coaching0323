import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

export function ensureVoiceMessageColumns() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url text`);
      await db.execute(
        sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration_ms integer`
      );
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
