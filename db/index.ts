import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getD1() {
  let database: D1Database | undefined;
  try {
    const workerModule = await import("cloudflare:workers");
    database = (workerModule.env as unknown as { DB?: D1Database }).DB;
  } catch {
    // Node 기반 렌더링에는 Cloudflare runtime이 없습니다.
  }
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return database;
}

export async function getDb() {
  return drizzle(await getD1(), { schema });
}
