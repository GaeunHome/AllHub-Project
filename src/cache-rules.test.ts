import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 規則的說明在 CLAUDE.md 的快取 改規則時兩邊要一起改
const SRC = fileURLToPath(new URL(".", import.meta.url));

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [path.relative(SRC, abs).split(path.sep).join("/")];
  });
}

const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");
const allFiles = new Set(walk(SRC));
const sources = [...allFiles].filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));
const moduleIds = fs.readdirSync(path.join(SRC, "modules"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

/** 這個檔案 import 的 src 裡的檔案 @/ 與相對路徑都換成 src 底下的路徑 套件不算 */
function importTargets(file: string): string[] {
  return [...read(file).matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)].flatMap((m) => {
    const spec = m[1] ?? m[2];
    const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : null;
    if (base === null) return [];
    const target = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((suffix) => base + suffix).find((candidate) => allFiles.has(candidate));
    return target ? [target] : [];
  });
}

/** 從左大括號找到對應的右大括號 略過字串 樣板字串與註解裡的括號 */
function blockFrom(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") i = source.indexOf("\n", i);
    else if (ch === "/" && source[i + 1] === "*") i = source.indexOf("*/", i) + 1;
    else if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === "\\") i++;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error("括號沒有對上");
}

type CachedFunction = { file: string; kind: string; signature: string; body: string };

const cachedFunctions: CachedFunction[] = sources.flatMap((file) => {
  const source = read(file);
  return [...source.matchAll(/(["'])use cache(?::\s*([a-z-]+))?\1/g)].map((m) => {
    const open = source.lastIndexOf("{", m.index);
    const start = source.lastIndexOf("function", open);
    return { file, kind: m[2] ?? "default", signature: source.slice(start, open), body: blockFrom(source, open) };
  });
});

const nextConfig = read("../next.config.ts");
const configuredProfiles = [...blockFrom(nextConfig, nextConfig.indexOf("{", nextConfig.indexOf("cacheLife:"))).matchAll(/^\s*(\w+):\s*\{/gm)].map((m) => m[1]);

describe("快取規則", () => {
  it("有掃到快取函式（避免規則因為沒掃到東西而空轉）", () => {
    expect(cachedFunctions.length).toBeGreaterThanOrEqual(15);
  });

  it("一律用 use cache: remote：資料都在登入檢查後才讀，Vercel 上記憶體快取跨不了實例、tag 失效也傳不到別的實例", () => {
    expect(cachedFunctions.filter((f) => f.kind !== "remote").map((f) => `${f.file}：use cache${f.kind === "default" ? "" : `: ${f.kind}`}`)).toEqual([]);
  });

  it("每個快取函式都明確呼叫 cacheLife 與 cacheTag，效期用 next.config.ts 定義的 profile", () => {
    const problems = cachedFunctions.flatMap(({ file, signature, body }) => {
      const issues: string[] = [];
      const profiles = [...body.matchAll(/cacheLife\(\s*["']([\w-]+)["']\s*\)/g)].map((m) => m[1]);
      if (profiles.length === 0) issues.push("沒有用具名的 cacheLife profile");
      for (const profile of profiles) if (!configuredProfiles.includes(profile)) issues.push(`next.config.ts 沒有 cacheLife profile「${profile}」`);
      if (!/\bcacheTag\(/.test(body)) issues.push("沒有 cacheTag");
      return issues.map((issue) => `${file} ${signature.trim()}：${issue}`);
    });
    expect(configuredProfiles).toEqual(expect.arrayContaining(["db", "external"]));
    expect(problems).toEqual([]);
  });

  it("快取函式所在的檔案不讀 cookies／headers、不碰登入：登入檢查不能被快取，要留在快取函式外面", () => {
    const files = [...new Set(cachedFunctions.map((f) => f.file))];
    // 會讀 cookie 或 header 的檔 加上登入的入口 core 裡用相對路徑 import 也算
    const login = new Set(["core/auth/index.ts", "core/auth/session.ts", ...sources.filter((file) => /from\s+["']next\/headers["']/.test(read(file)))]);
    const offenders = files.flatMap((file) => {
      const source = read(file);
      const reasons = [
        ...(/from\s+["'](?:next\/headers|@\/core\/auth[^"']*)["']/.test(source) ? ["import 了 next/headers 或 @/core/auth"] : []),
        ...importTargets(file)
          .filter((target) => login.has(target))
          .map((target) => `import 了會讀 cookie 或登入的 ${target}`),
        ...(/\b(?:cookies|headers)\(\)/.test(source) ? ["讀了 cookies() 或 headers()"] : []),
        ...(/\b(?:requireSession|requireOwner|currentSession)\s*\(/.test(source) ? ["呼叫了 requireSession／requireOwner／currentSession"] : []),
      ];
      return reasons.map((reason) => `${file}：${reason}`);
    });
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(login.size).toBeGreaterThan(2);
    expect(offenders).toEqual([]);
  });

  it("快取函式的參數不能有 cookie：參數會成為快取 key，以明文存放", () => {
    expect(cachedFunctions.filter((f) => /cookie/i.test(f.signature)).map((f) => `${f.file} ${f.signature.trim()}`)).toEqual([]);
  });

  it("讓快取失效一律透過 core/cache（Server Action 用 updateTags、其他用 expireTags），不直接 import updateTag／revalidateTag", () => {
    const offenders = sources.filter(
      (file) => file !== "core/cache.ts" && /import\s*\{[^}]*\b(?:updateTag|revalidateTag|revalidatePath)\b[^}]*\}\s*from\s*["']next\/cache["']/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("tag 不在呼叫處手寫字串，一律用 cache-tags.ts 的定義（避免打錯字）", () => {
    const offenders = sources.flatMap((file) =>
      read(file)
        .split("\n")
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => /\b(?:cacheTag|updateTags|expireTags)\(\s*["'`]/.test(line) || /\bexpiringTask\(.*["'`]/.test(line.replace(/^\s*["'][\w:-]+["']\s*:/, "")))
        .map(({ at, line }) => `${at} ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("每個有資料表的模組都在 service/cache-tags.ts 定義 tag，而且都以「模組 id:」開頭；core 的以「core:」開頭", () => {
    const problems = moduleIds.flatMap((id) => {
      if (!fs.existsSync(path.join(SRC, `modules/${id}/data/schema.ts`))) return [];
      const file = `modules/${id}/service/cache-tags.ts`;
      if (!fs.existsSync(path.join(SRC, file))) return [`${file}：缺少 tag 定義`];
      return [...read(file).matchAll(/["'`]([a-z][a-z0-9-]*):/g)].filter((m) => m[1] !== id).map((m) => `${file}：${m[0]} 要以 ${id}: 開頭`);
    });
    const coreTagFiles = sources.filter((file) => file.startsWith("core/") && file.endsWith("/cache-tags.ts"));
    const coreTags = coreTagFiles.flatMap((file) => [...read(file).matchAll(/["'`]([a-z][a-z0-9-]*):/g)].map((m) => ({ file, tag: m[0], owner: m[1] })));
    expect(coreTagFiles).toEqual(expect.arrayContaining(["core/notifications/cache-tags.ts", "core/auth/cache-tags.ts"]));
    expect(coreTags.length).toBeGreaterThan(0);
    expect(coreTags.filter((t) => t.owner !== "core").map((t) => `${t.file}：${t.tag}`)).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("每個排程都用 expiringTask 包起來登記（成功或失敗都讓 tag 失效）", () => {
    const registries = [...moduleIds.map((id) => `modules/${id}/cron.ts`).filter((file) => fs.existsSync(path.join(SRC, file))), "core/notifications/cron.ts"];
    const problems = registries.flatMap((file) => {
      const source = read(file);
      const open = source.indexOf("{", source.search(/Record<string,\s*CronTask>\s*=/));
      const entries = blockFrom(source, open)
        .slice(1, -1)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//"));
      if (entries.length === 0) return [`${file}：找不到排程`];
      return entries.filter((line) => !/^["']?[\w:-]+["']?\s*:\s*expiringTask\(/.test(line)).map((line) => `${file}：${line}`);
    });
    expect(registries.length).toBeGreaterThanOrEqual(4);
    expect(problems).toEqual([]);
  });

  it("寫入流程與排程不讀快取（cached.ts）：要依最新資料判斷，只有頁面與輪詢 API 讀快取", () => {
    // core 沒有 service 資料夾 直接用資料庫 用 attempts 記次數與認領 或是 Server Action 的檔就是寫入流程
    // 註冊 登入鎖定 邀請次數都要讀最新的資料
    const coreWriters = sources.filter(
      (file) =>
        file.startsWith("core/") &&
        !file.endsWith("/cached.ts") &&
        (importTargets(file).some((target) => target === "core/db/index.ts" || target === "core/auth/attempts.ts") || /^\s*["']use server["']/.test(read(file))),
    );
    const isWriter = (file: string) =>
      /\/service\/(?!cached\.ts$)[^/]+$/.test(file) ||
      /(^|\/)cron\.ts$/.test(file) ||
      /^modules\/[^/]+\/web\/actions[^/]*\.ts$/.test(file) ||
      /^modules\/[^/]+\/web\/routes\//.test(file) ||
      coreWriters.includes(file);
    // CLAUDE.md 寫明的例外 保留影片的標題快照用觀看頁讀過的 oEmbed 只是顯示用
    const ALLOWED_READS: Record<string, string[]> = { "modules/youtube/web/actions.ts": ["cachedVideoInfo"] };
    const offenders = sources.filter(isWriter).flatMap((file) =>
      [...read(file).matchAll(/\bimport\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']*\/cached)["']/g)].flatMap((m) => {
        const names = /^\{[^}]*\}$/.test(m[2].trim()) ? m[2].trim().slice(1, -1).split(",").map((name) => name.trim().replace(/^type\s+/, "")).filter(Boolean) : null;
        const allowed = ALLOWED_READS[file] ?? [];
        return !m[1] && names?.every((name) => allowed.includes(name)) ? [] : [`${file} → ${m[3]}：${m[2].trim()}`];
      }),
    );
    // 先確認認得出 core 的寫入流程 規則才不會因為沒掃到東西而空轉
    expect(coreWriters).toEqual(expect.arrayContaining(["core/notify.ts", "core/auth/actions.ts", "core/admin/actions.ts"]));
    expect(offenders).toEqual([]);
  });
});
