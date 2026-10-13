import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 規則的說明在 CLAUDE.md「架構規則」，改規則時兩邊要一起改
const SRC = fileURLToPath(new URL(".", import.meta.url));
const LAYERS = ["web", "service", "data", "lib", "dev"] as const;
const MODULE_ROOT_FILES = ["info.ts", "cron.ts"];

type Layer = (typeof LAYERS)[number] | "root";
type Place =
  | { zone: "app" | "core" | "dev" | "proxy" | "registry" | "other" }
  | { zone: "module"; id: string; layer: Layer; rest: string };
type Import = { from: string; spec: string; target: string; typeOnly: boolean };

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [path.relative(SRC, abs).split(path.sep).join("/")];
  });
}

function placeOf(file: string): Place {
  const parts = file.split("/");
  if (parts[0] === "modules") {
    if (parts.length === 2) return { zone: "registry" };
    const layer = parts.length === 3 ? "root" : (parts[2] as Layer);
    return { zone: "module", id: parts[1], layer, rest: parts.slice(2).join("/") };
  }
  if (parts[0] === "app" || parts[0] === "core" || parts[0] === "dev") return { zone: parts[0] };
  if (file === "proxy.ts") return { zone: "proxy" };
  return { zone: "other" };
}

const fileSet = new Set(walk(SRC));
const files = [...fileSet].filter((f) => /\.(ts|tsx)$/.test(f));

function resolve(from: string, spec: string): string | null | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null; // 套件
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (fileSet.has(base + suffix)) return base + suffix;
  }
  return undefined;
}

/** 解析 import／export from、副作用 import、動態 import 與 vi.mock；import type 與全部帶 type 的具名匯入視為只用型別 */
function importsOf(file: string): Import[] {
  const source = fs.readFileSync(path.join(SRC, file), "utf8");
  const found: { spec: string; typeOnly: boolean }[] = [];
  for (const m of source.matchAll(/\b(?:import|export)\s+(type\s+)?([^;"']*?)\s*from\s*["']([^"']+)["']/g)) {
    const clause = m[2].trim();
    const inlineTypes = /^\{[^}]*\}$/.test(clause) && clause.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "));
    found.push({ spec: m[3], typeOnly: Boolean(m[1]) || inlineTypes });
  }
  for (const m of source.matchAll(/\bimport\s+["']([^"']+)["']/g)) found.push({ spec: m[1], typeOnly: false });
  for (const m of source.matchAll(/\b(?:import|vi\.mock)\(\s*["']([^"']+)["']/g)) found.push({ spec: m[1], typeOnly: false });

  return found.flatMap(({ spec, typeOnly }) => {
    const target = resolve(file, spec);
    if (target === null) return [];
    return [{ from: file, spec, target: target ?? `（無法解析）${spec}`, typeOnly }];
  });
}

const allImports = files.flatMap(importsOf);
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const describeImport = (i: Import, reason: string) => `${i.from} → ${i.spec}：${reason}`;

/** 無法解析的 import 由專門的測試回報，這裡略過，避免一個錯誤讓每條規則都失敗 */
function violations(rule: (i: Import, from: Place, to: Place) => string | null): string[] {
  return allImports.flatMap((i) => {
    if (i.target.startsWith("（無法解析）")) return [];
    const reason = rule(i, placeOf(i.from), placeOf(i.target));
    return reason ? [describeImport(i, reason)] : [];
  });
}

/** 模組對外公開、src/app 可以用的入口 */
function isPublicEntry(to: Place): boolean {
  if (to.zone !== "module") return false;
  return to.rest === "info.ts" || to.rest === "cron.ts" || to.rest.startsWith("web/pages/") || to.rest.startsWith("web/routes/");
}

describe("架構規則", () => {
  it("沒有無法解析的 import", () => {
    expect(allImports.filter((i) => i.target.startsWith("（無法解析）")).map((i) => describeImport(i, "找不到這個檔案"))).toEqual([]);
  });

  it("模組彼此獨立：不 import 其他模組、模組清單或 src/app", () => {
    const found = violations((_, from, to) => {
      if (from.zone !== "module") return null;
      if (to.zone === "module" && to.id !== from.id) return `模組 ${from.id} 不能依賴模組 ${to.id}`;
      if (to.zone === "registry" || to.zone === "app") return "模組不能依賴模組清單或 src/app";
      return null;
    });
    expect(found).toEqual([]);
  });

  it("core 不依賴模組與 src/app", () => {
    const found = violations((_, from, to) => {
      if (from.zone !== "core") return null;
      return to.zone === "module" || to.zone === "registry" || to.zone === "app" ? "core 是共用基礎，不能依賴模組或 src/app" : null;
    });
    expect(found).toEqual([]);
  });

  it("只有測試可以用 src/dev 的開發工具", () => {
    const found = violations((i, from, to) => (to.zone === "dev" && from.zone !== "dev" && !isTest(i.from) ? "正式程式不能依賴 src/dev" : null));
    expect(found).toEqual([]);
  });

  it("src/app 與 proxy 只透過公開入口使用模組", () => {
    const found = violations((_, from, to) => {
      if (from.zone === "proxy") return to.zone === "core" ? null : "proxy 只能依賴 core";
      if (from.zone !== "app") return null;
      if (to.zone === "module" && !isPublicEntry(to)) return "src/app 只能用模組的 info、cron、web/pages、web/routes";
      return null;
    });
    expect(found).toEqual([]);
  });

  it("模組清單只登記各模組的 info 與 cron", () => {
    const found = violations((_, from, to) => {
      if (from.zone !== "registry" || to.zone !== "module") return null;
      return to.rest === "info.ts" || to.rest === "cron.ts" ? null : "模組清單只能 import info.ts 與 cron.ts";
    });
    expect(found).toEqual([]);
  });

  it("模組內分層只能往下依賴：web → service → data → lib", () => {
    const allowed: Record<Layer, Layer[]> = {
      root: ["service", "root"], // cron 呼叫 service
      web: ["web", "service", "data", "lib"],
      service: ["service", "data", "lib"],
      data: ["data", "lib"],
      lib: ["lib"],
      dev: ["dev"],
    };
    const found = violations((i, from, to) => {
      if (from.zone === "module" && to.zone === "core" && from.layer === "web" && i.target.startsWith("core/db/")) {
        return "web 層不能直接查資料庫，請透過 service";
      }
      if (from.zone !== "module" || to.zone !== "module" || from.id !== to.id) return null;
      if (to.layer === "root" && from.layer !== "root") return "模組根目錄的 info、cron 只給模組清單用；環境變數改用 @/core/env";
      if (!allowed[from.layer].includes(to.layer)) return `${from.layer} 層不能依賴 ${to.layer} 層`;
      if (from.layer === "web" && to.layer === "data" && !i.typeOnly) return "web 層只能 import data 的型別（import type）";
      return null;
    });
    expect(found).toEqual([]);
  });

  it("每個模組結構一致：根目錄只有 info／cron 與分層資料夾，且都已登記", () => {
    const modulesDir = path.join(SRC, "modules");
    const registry = fs.readFileSync(path.join(modulesDir, "index.ts"), "utf8");
    const cronRegistry = fs.readFileSync(path.join(modulesDir, "cron.ts"), "utf8");
    const problems = fs
      .readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name: id }) => {
        const entries = fs.readdirSync(path.join(modulesDir, id), { withFileTypes: true });
        const issues = entries
          .filter((e) => (e.isDirectory() ? !(LAYERS as readonly string[]).includes(e.name) : !MODULE_ROOT_FILES.includes(e.name)))
          .map((e) => `${id}/${e.name}：不屬於任何一層（允許 ${[...MODULE_ROOT_FILES, ...LAYERS.map((l) => l + "/")].join("、")}）`);
        if (!entries.some((e) => e.name === "info.ts")) issues.push(`${id}：缺少 info.ts`);
        else if (!registry.includes(`./${id}/info"`)) issues.push(`${id}：還沒登記到 modules/index.ts`);
        if (entries.some((e) => e.name === "cron.ts") && !cronRegistry.includes(`./${id}/cron"`)) issues.push(`${id}：cron.ts 還沒登記到 modules/cron.ts`);
        return issues;
      });
    expect(problems).toEqual([]);
  });

  // core 的 HomePage 只排版、不能 import 模組，卡片由 src/app 的首頁組合：漏了就不會出現在首頁
  it("每個模組的首頁卡片（web/pages/home-card.tsx）都組合到首頁（src/app/(main)/page.tsx）", () => {
    const homePage = "app/(main)/page.tsx";
    const composed = new Set(allImports.filter((i) => i.from === homePage).map((i) => i.target));
    const cards = [...fileSet].filter((file) => /^modules\/[^/]+\/web\/pages\/home-card\.tsx$/.test(file));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.filter((card) => !composed.has(card)).map((card) => `${card}：還沒組合到 ${homePage}`)).toEqual([]);
  });

  // 「提醒方式」依 notifies 決定列哪些模組：沒呼叫 notify() 卻列出來會多一排沒用的開關，反過來則是通知關不掉
  it("沒有呼叫 notify() 的模組在 info.ts 設 notifies: false，有呼叫的不設", async () => {
    const { modules } = await import("./modules");
    const notifying = new Set(
      allImports
        .filter((i) => i.target === "core/notify.ts" && !i.typeOnly && !isTest(i.from))
        .flatMap((i) => {
          const from = placeOf(i.from);
          return from.zone === "module" ? [from.id] : [];
        }),
    );
    const problems = modules.flatMap((info) => {
      if (notifying.has(info.id) && info.notifies === false) return [`${info.id}：有呼叫 notify()，info.ts 不能設 notifies: false`];
      if (!notifying.has(info.id) && info.notifies !== false) return [`${info.id}：沒有呼叫 notify()，info.ts 要設 notifies: false`];
      return [];
    });
    expect(problems).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「架構規則」的 env.ts：環境變數都經過 core/env.ts 驗證，例外只有這裡列的幾種
  it("process.env 只出現在例外的地方：core/env.ts、NODE_ENV、proxy.ts 的 SESSION_SECRET、drizzle.config.ts 的 DATABASE_URL、src/dev 的命令列工具、假外部服務的 MOCK_ 設定、測試檔", () => {
    const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");
    const rootConfigs = fs
      .readdirSync(path.join(SRC, ".."))
      .filter((name) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(name) && !name.endsWith(".d.ts"))
      .map((name) => `../${name}`);
    const scanned = [...[...fileSet].filter((file) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)), ...rootConfigs];
    // 命令列工具是 node 直接執行的入口（有 import.meta.main）；假外部服務是 mock:external 載入的檔案
    const isCli = (file: string) => file.startsWith("dev/") && /\bimport\.meta\.main\b/.test(read(file));
    const isMock = (file: string) => file === "dev/mock-external.mjs" || /^modules\/[^/]+\/dev\/mock\.mjs$/.test(file);
    const allowed = (file: string, name: string | undefined): boolean => {
      if (isTest(file) || file === "core/env.ts" || name === "NODE_ENV") return true;
      if (file === "proxy.ts") return name === "SESSION_SECRET";
      if (file === "../drizzle.config.ts") return name === "DATABASE_URL";
      if (isMock(file)) return name?.startsWith("MOCK_") ?? false;
      return isCli(file);
    };
    const uses = scanned.flatMap((file) =>
      read(file)
        .split("\n")
        .flatMap((line, i) => [...line.matchAll(/process\.env(?:\.([A-Za-z_]\w*)|\[\s*["'](\w+)["']\s*\])?/g)].map((m) => ({ file, name: m[1] ?? m[2], at: `${file}:${i + 1} ${line.trim()}` }))),
    );

    // 先確認真的掃到了已知的用法，規則才不會因為沒掃到東西而空轉
    expect(uses.map((use) => use.file)).toEqual(expect.arrayContaining(["core/env.ts", "proxy.ts", "../drizzle.config.ts", "dev/mock-external.mjs"]));
    expect(uses.filter((use) => !allowed(use.file, use.name)).map((use) => use.at)).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「程式碼慣例」：ICU 版本不同時語系輸出的空白字元會變（CI 曾因此失敗），所以只取數字欄位自己組
  it("日期時間顯示一律用 core/time.ts：不直接用 Intl.DateTimeFormat 或 toLocale*String", () => {
    const allowed = new Set(["core/time.ts", "dev/icu-simulation.ts"]);
    const offenders = files
      .filter((file) => !isTest(file) && !allowed.has(file))
      .flatMap((file) =>
        fs
          .readFileSync(path.join(SRC, file), "utf8")
          .split("\n")
          .flatMap((line, i) => (/\bIntl\.DateTimeFormat\b|\.toLocale(?:Date|Time)?String\(/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])),
      );
    expect(offenders).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「程式碼慣例」：焦點鎖定、Esc、點背景、關閉後還焦點、Activity 藏起來時一定關掉，都只寫在共用的元件裡
  it("原生的 <dialog> 與 showModal() 只出現在 core/ui/dialog.tsx，其他地方用它的 Dialog／DialogButton", () => {
    const offenders = files
      .filter((file) => !isTest(file) && file !== "core/ui/dialog.tsx")
      .flatMap((file) =>
        fs
          .readFileSync(path.join(SRC, file), "utf8")
          .split("\n")
          .flatMap((line, i) => (/<dialog\b|\.showModal\(/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])),
      );
    expect(fs.readFileSync(path.join(SRC, "core/ui/dialog.tsx"), "utf8")).toMatch(/<dialog\b[\s\S]*\.showModal\(|\.showModal\([\s\S]*<dialog\b/);
    expect(offenders).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「程式碼慣例」的畫面風格：Activity 藏起來的頁面還留在文件裡，:root:has() 會比對到它；PageTheme 在藏起來時標記，選擇器才排除得掉
  it("會換整頁樣式的主題 class（globals.css 的 :root:has(.theme-…)）只放在 core/ui/page-theme.tsx 的 PageTheme 上", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const pageThemes = [...new Set([...css.matchAll(/(?::root|html|body):has\(\.(theme-[\w-]+)/g)].map((m) => m[1]))];
    const offenders = files
      .filter((file) => !isTest(file) && file.endsWith(".tsx"))
      .flatMap((file) =>
        fs
          .readFileSync(path.join(SRC, file), "utf8")
          .split("\n")
          .flatMap((line, i) => {
            const isComment = /^\s*(?:\/\/|\{\/\*|\/?\*)/.test(line);
            const usesTheme = pageThemes.some((theme) => new RegExp(`["'\`\\s]${theme}\\b`).test(line));
            return usesTheme && !isComment && !/<PageTheme\b/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [];
          }),
      );
    expect(pageThemes).toContain("theme-youtube");
    expect(offenders).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「間距與對齊」：Server Action 的表單開頭有 React 加的隱藏 input，串流中的 Suspense 會在原地多一個 <template>，第幾個子元素會算錯
  it("不從外框用子元素的位置排欄（[&>:nth-child()]、[&>:last-child]、*:first: 這類）；[&>:first-child] 只能挑永遠排第一個的 PageHeader", () => {
    const POSITIONAL = /nth-child\(|nth-last-child\(|last-child|only-child|nth-of-type\(|nth-last-of-type\(|first-of-type|last-of-type|only-of-type/;
    // Tailwind 的 *:（子元素）、**:（子孫）加上 first:、nth-2: 這類變體，跟 [&>:first-child] 一樣是從外框挑第幾個
    const CHILD_VARIANT = /(?<![\w-])\*{1,2}:(?:[\w-]+:)*?(?:first|last|only|odd|even|(?:first|last|only)-of-type|nth-[^\s:"'`]+):/g;
    const problems = files
      .filter((file) => !isTest(file))
      .flatMap((file) => {
        const source = fs.readFileSync(path.join(SRC, file), "utf8");
        const lineOf = (index: number) => source.slice(0, index).split("\n").length;
        const childVariants = [...source.matchAll(CHILD_VARIANT)].map((m) => `${file}:${lineOf(m.index)} ${m[0]}：不能用子元素的位置排欄，col-span 寫在元素自己身上`);
        const outerSelectors = [...source.matchAll(/\[&>[^\]\s"'`]*\]/g)].flatMap((m) => {
          const at = `${file}:${lineOf(m.index)} ${m[0]}`;
          if (POSITIONAL.test(m[0])) return [`${at}：不能用子元素的位置排欄，col-span 寫在元素自己身上`];
          if (!m[0].includes("first-child")) return [];
          // 這個 class 所在的開頭標籤結束後，第一個 JSX 子元素（略過空白與 {/* */} 註解）要是 PageHeader
          const rest = source.slice(m.index + m[0].length);
          const tagEnd = rest.search(/["'`][^>]*?>/);
          const firstChild = tagEnd < 0 ? null : rest.slice(tagEnd).replace(/^["'`][^>]*?>/, "").match(/^(?:\s|\{\/\*[\s\S]*?\*\/\})*<([A-Za-z.]+)/)?.[1];
          return firstChild === "PageHeader" ? [] : [`${at}：[&>:first-child] 只能用在第一個子元素是 <PageHeader> 的外框（這裡是 ${firstChild ?? "看不出來"}）`];
        });
        return [...childVariants, ...outerSelectors];
      });
    expect(problems).toEqual([]);
  });

  // 規則寫在 CLAUDE.md「程式碼慣例」：externalFetch() 在開發時改送假伺服器、加上逾時；直接呼叫全域 fetch 會在 E2E 打到真的服務
  it("正式程式不直接呼叫全域 fetch()：對外請求經 core/external-url 的 externalFetch；例外只有它本身與 client 元件呼叫自家的 /api/", () => {
    const problems = files
      .filter((file) => !isTest(file) && placeOf(file).zone !== "dev" && file !== "core/external-url.ts")
      .flatMap((file) => {
        const source = fs.readFileSync(path.join(SRC, file), "utf8");
        const isClient = /^\s*["']use client["']/.test(source);
        // 同一個檔案裡寫成常數的自家 API 路徑，例如 const API = "/api/notifications"
        const apiConstants = new Set([...source.matchAll(/\bconst\s+(\w+)\s*=\s*["'`]\/api\//g)].map((m) => m[1]));
        return [...source.matchAll(/(?<![\w.$])(?:(?:globalThis|window|self)\.)?fetch\(\s*([^,)\s]*)/g)].flatMap((m) => {
          const target = m[1];
          const ownApi = /^["'`]\/api\//.test(target) || apiConstants.has(target);
          if (isClient && ownApi) return [];
          return [`${file}:${source.slice(0, m.index).split("\n").length} ${m[0]}：改用 externalFetch()${ownApi ? "（只有 client 元件可以直接呼叫自家的 /api/）" : ""}`];
        });
      });
    // 先確認真的掃到了已知的例外（通知中心輪詢自家的 API），規則才不會因為沒掃到東西而空轉
    expect(fs.readFileSync(path.join(SRC, "core/notifications/center.tsx"), "utf8")).toMatch(/(?<![\w.$])fetch\(API/);
    expect(problems).toEqual([]);
  });

  it("資料表只定義在 core/db/schema.ts 與各模組的 data/schema.ts（drizzle.config.ts 只收這些檔案），表名加前綴", () => {
    const isSchemaFile = (file: string) => file === "core/db/schema.ts" || /^modules\/[^/]+\/data\/schema\.ts$/.test(file);
    const problems = files
      .filter((file) => !isTest(file))
      .flatMap((file) => {
        const tables = [...fs.readFileSync(path.join(SRC, file), "utf8").matchAll(/\bpgTable\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
        if (tables.length === 0) return [];
        if (!isSchemaFile(file)) return [`${file}：資料表要放在 core/db/schema.ts 或模組的 data/schema.ts`];
        const prefix = file.startsWith("core/") ? "core_" : `${file.split("/")[1]}_`;
        return tables.filter((table) => !table.startsWith(prefix)).map((table) => `${file}：${table} 要以 ${prefix} 開頭`);
      });
    expect(fileSet.has("core/db/schema.ts")).toBe(true);
    expect(problems).toEqual([]);
    const drizzleConfig = fs.readFileSync(path.join(SRC, "../drizzle.config.ts"), "utf8");
    expect(drizzleConfig).toContain('"./src/core/db/schema.ts"');
    expect(drizzleConfig).toContain('"./src/modules/*/data/schema.ts"');
  });
});
