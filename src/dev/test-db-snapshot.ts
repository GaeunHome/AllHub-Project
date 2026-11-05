import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";

const MIGRATIONS = "src/core/db/migrations";
const CACHE_DIR = "node_modules/.cache/allhub-test-db";

declare module "vitest" {
  export interface ProvidedContext {
    testDbSnapshot: string;
    emptyDbSnapshot: string;
  }
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  });

// migration 或 PGlite 的版本一變 快取的資料庫就不能用
function snapshotKey(): string {
  const hash = createHash("sha256");
  hash.update(readFileSync("node_modules/@electric-sql/pglite/package.json"));
  for (const file of sourceFiles(MIGRATIONS).sort()) hash.update(file).update(readFileSync(file));
  return hash.digest("hex").slice(0, 16);
}

async function buildSnapshot(target: string, migrated: boolean) {
  const client = new PGlite();
  await client.waitReady;
  if (migrated) await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  const dump = await client.dumpDataDir("none");
  await client.close();
  mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.${process.pid}`;
  writeFileSync(partial, Buffer.from(await dump.arrayBuffer()));
  renameSync(partial, target);
}

/** vitest 的 globalSetup 整輪只跑一次 啟動 PGlite 加套 migration 要好幾秒 建好存成檔給每個測試檔載入 */
export default async function setup({ provide }: TestProject) {
  const key = snapshotKey();
  const migrated = path.resolve(CACHE_DIR, `${key}-migrated.tar`);
  const empty = path.resolve(CACHE_DIR, `${key}-empty.tar`);
  // 舊版本的快照用不到了 一份 40MB 不留著
  for (const file of existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR) : []) if (!file.startsWith(key)) rmSync(path.join(CACHE_DIR, file), { force: true });
  if (!existsSync(migrated)) await buildSnapshot(migrated, true);
  if (!existsSync(empty)) await buildSnapshot(empty, false);
  provide("testDbSnapshot", migrated);
  provide("emptyDbSnapshot", empty);
}
