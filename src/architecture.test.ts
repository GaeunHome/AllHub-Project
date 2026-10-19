import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { readStylesheet, stylesheetImports } from "./dev/stylesheet";

// 規則的說明在 CLAUDE.md 的架構規則 改規則時兩邊要一起改
const SRC = fileURLToPath(new URL(".", import.meta.url));
const LAYERS = ["web", "service", "data", "lib", "dev"] as const;
const MODULE_ROOT_FILES = ["info.ts", "cron.ts"];
// macOS 的 Finder 會在資料夾裡留下這個檔 不算程式
const IGNORED_ENTRIES = [".DS_Store"];

type Layer = (typeof LAYERS)[number] | "root";
type Place =
  | { zone: "app" | "core" | "dev" | "proxy" | "registry" | "other" }
  | { zone: "module"; id: string; layer: Layer; rest: string };
type Import = { from: string; spec: string; target: string; typeOnly: boolean };
type Spec = { spec: string; typeOnly: boolean };

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
const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");
const moduleIds = fs
  .readdirSync(path.join(SRC, "modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

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

/**
 * 解析 import 與 export from 副作用 import 動態 import 和 vi.mock
 * import type 與全部帶 type 的具名匯入算只用型別
 */
function specsOf(file: string): Spec[] {
  const source = read(file);
  const found: Spec[] = [];
  for (const m of source.matchAll(/\b(?:import|export)\s+(type\s+)?([^;"']*?)\s*from\s*["']([^"']+)["']/g)) {
    const clause = m[2].trim();
    const inlineTypes = /^\{[^}]*\}$/.test(clause) && clause.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "));
    found.push({ spec: m[3], typeOnly: Boolean(m[1]) || inlineTypes });
  }
  for (const m of source.matchAll(/\bimport\s+["']([^"']+)["']/g)) found.push({ spec: m[1], typeOnly: false });
  for (const m of source.matchAll(/\b(?:import|vi\.mock)\(\s*["']([^"']+)["']/g)) found.push({ spec: m[1], typeOnly: false });
  return found;
}

function importsOf(file: string): Import[] {
  return specsOf(file).flatMap(({ spec, typeOnly }) => {
    const target = resolve(file, spec);
    if (target === null) return [];
    return [{ from: file, spec, target: target ?? `（無法解析）${spec}`, typeOnly }];
  });
}

const allImports = files.flatMap(importsOf);
/** 套件的 import 例如 next/headers */
const packageImports = files.flatMap((file) => specsOf(file).flatMap(({ spec, typeOnly }) => (resolve(file, spec) === null ? [{ from: file, spec, typeOnly }] : [])));
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const describeImport = (i: Import, reason: string) => `${i.from} → ${i.spec}：${reason}`;

/** 無法解析的 import 由專門的測試回報 這裡略過 免得一個錯誤讓每條規則都失敗 */
function violations(rule: (i: Import, from: Place, to: Place) => string | null): string[] {
  return allImports.flatMap((i) => {
    if (i.target.startsWith("（無法解析）")) return [];
    const reason = rule(i, placeOf(i.from), placeOf(i.target));
    return reason ? [describeImport(i, reason)] : [];
  });
}

/** 模組對外公開 src/app 可以用的入口 */
function isPublicEntry(to: Place): boolean {
  if (to.zone !== "module") return false;
  return to.rest === "info.ts" || to.rest === "cron.ts" || to.rest.startsWith("web/pages/") || to.rest.startsWith("web/routes/");
}

const syntaxCache = new Map<string, ts.SourceFile>();
/** 要看函式內容的規則用 TypeScript 自己的解析器 不靠 regex 猜括號 */
function syntaxOf(file: string): ts.SourceFile {
  let sourceFile = syntaxCache.get(file);
  if (!sourceFile) {
    sourceFile = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    syntaxCache.set(file, sourceFile);
  }
  return sourceFile;
}

/** 開頭的指示字串 例如 use server */
function directivesOf(statements: ts.NodeArray<ts.Statement>): string[] {
  const directives: string[] = [];
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    directives.push(statement.expression.text);
  }
  return directives;
}

/** 拿掉註解後每條規則的選擇器 一個選擇器清單拆成好幾個 @media 這類 at-rule 不算 */
function selectorsOf(css: string): string[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((head) => !head.startsWith("@"))
    .flatMap((head) => {
      const parts = [""];
      let depth = 0;
      for (const ch of head) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) parts.push("");
        else parts[parts.length - 1] += ch;
      }
      return parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    });
}
const classesOf = (selector: string) => [...selector.replace(/"[^"]*"|'[^']*'/g, '""').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
const attributesOf = (selector: string) => [...selector.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1]);
const isModuleCss = (file: string) => /^modules\/[^/]+\/web\/.+\.css$/.test(file);

const lineOf = (sourceFile: ts.SourceFile, node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

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

  it("只有測試與模組 dev/ 的測試輔助可以用 src/dev 的開發工具", () => {
    const found = violations((i, from, to) => {
      if (to.zone !== "dev" || from.zone === "dev" || isTest(i.from)) return null;
      if (from.zone === "module" && from.layer === "dev") return null;
      return "正式程式不能依賴 src/dev";
    });
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

  // src/app 只是路由殼 頁面 render core 的頁面元件 route handler 轉接 core 的實作
  // 其他的 core 程式要經過這些入口 新增入口時加進清單
  it("src/app 只用 core 的頁面元件、route handler、排程、robots、外觀與登入檢查（允許清單）", () => {
    const APP_CORE_ENTRIES = [
      "core/admin/admin-page.tsx",
      "core/auth/account-page.tsx",
      "core/auth/captcha-route.ts",
      "core/auth/login-page.tsx",
      "core/auth/register-page.tsx",
      "core/auth/session-guard.tsx",
      "core/cron.ts",
      "core/notifications/api.ts",
      "core/notifications/notifications-page.tsx",
      "core/robots.ts",
      "core/ui/app-shell.tsx",
      "core/ui/home-page.tsx",
      "core/ui/terms-page.tsx",
      "core/ui/theme-sync.tsx",
      "core/ui/theme.ts",
    ];
    const found = violations((i, from, to) => (from.zone === "app" && to.zone === "core" && !i.typeOnly && !APP_CORE_ENTRIES.includes(i.target) ? "src/app 只轉接，core 的這個檔不在允許清單" : null));
    expect(found).toEqual([]);
  });

  it("模組清單只登記各模組的 info 與 cron", () => {
    const found = violations((_, from, to) => {
      if (from.zone !== "registry" || to.zone !== "module") return null;
      return to.rest === "info.ts" || to.rest === "cron.ts" ? null : "模組清單只能 import info.ts 與 cron.ts";
    });
    expect(found).toEqual([]);
  });

  // dev/ 放假外部服務與測試共用的 fixture 只有測試用得到
  // fixture 不碰 service 與 web 測試才不會繞過要測的流程
  it("模組內分層只能往下依賴：web → service → data → lib；dev/ 只給測試用，它自己只用 lib、data 的型別與 src/dev", () => {
    const allowed: Record<Layer, Layer[]> = {
      root: ["service", "root"], // cron 呼叫 service
      web: ["web", "service", "data", "lib"],
      service: ["service", "data", "lib"],
      data: ["data", "lib"],
      lib: ["lib"],
      dev: ["dev", "lib", "data"],
    };
    const found = violations((i, from, to) => {
      if (from.zone === "module" && to.zone === "core" && from.layer === "web" && i.target.startsWith("core/db/")) {
        return "web 層不能直接查資料庫，請透過 service";
      }
      if (from.zone !== "module" || to.zone !== "module" || from.id !== to.id) return null;
      if (to.layer === "root" && from.layer !== "root") return "模組根目錄的 info、cron 只給模組清單用；環境變數改用 @/core/env";
      if (to.layer === "dev" && from.layer !== "dev") return isTest(i.from) ? null : "dev/ 是假外部服務與測試輔助，只有測試可以 import";
      if (!allowed[from.layer].includes(to.layer)) return `${from.layer} 層不能依賴 ${to.layer} 層`;
      if (from.layer === "web" && to.layer === "data" && !i.typeOnly) return `${from.layer} 層只能 import data 的型別（import type）`;
      return null;
    });
    expect(found).toEqual([]);
  });

  // notify cooldown attempts claim 清理 都會寫資料庫 web 要經過 service
  // 使用者 id 一律由 web 呼叫 requireSession 後傳給 service 規則寫在 CLAUDE.md 的多人
  it("模組的 web 不直接用會寫資料庫的 core 工具（notify、cooldown、auth/attempts、claim、retention-cleanup）；service、data、lib 不碰登入（@/core/auth、next/headers，import type 除外）", () => {
    const WRITERS = ["core/notify.ts", "core/cooldown.ts", "core/auth/attempts.ts", "core/claim.ts", "core/retention-cleanup.ts"];
    const LOWER = ["service", "data", "lib"];
    const found = violations((i, from) => {
      if (from.zone !== "module" || isTest(i.from) || i.typeOnly) return null;
      if (from.layer === "web" && WRITERS.includes(i.target)) return "web 層不直接寫資料庫：通知、冷卻與認領放在 service";
      if (LOWER.includes(from.layer) && i.target === "core/auth/index.ts") return `${from.layer} 層不碰登入：使用者 id 由 web 呼叫 requireSession() 後傳進來`;
      return null;
    });
    const headers = packageImports
      .filter((i) => {
        const from = placeOf(i.from);
        return i.spec === "next/headers" && from.zone === "module" && LOWER.includes(from.layer) && !isTest(i.from) && !i.typeOnly;
      })
      .map((i) => `${i.from} → next/headers：service、data、lib 不讀 cookie 與 header`);
    expect([...found, ...headers]).toEqual([]);
  });

  it("每個模組結構一致：根目錄只有 info／cron 與分層資料夾，且都已登記", () => {
    const modulesDir = path.join(SRC, "modules");
    const registry = fs.readFileSync(path.join(modulesDir, "index.ts"), "utf8");
    const cronRegistry = fs.readFileSync(path.join(modulesDir, "cron.ts"), "utf8");
    const problems = moduleIds.flatMap((id) => {
      const entries = fs.readdirSync(path.join(modulesDir, id), { withFileTypes: true }).filter((e) => !IGNORED_ENTRIES.includes(e.name));
      const issues = entries
        .filter((e) => (e.isDirectory() ? !(LAYERS as readonly string[]).includes(e.name) : !MODULE_ROOT_FILES.includes(e.name)))
        .map((e) => `${id}/${e.name}：不屬於任何一層（允許 ${[...MODULE_ROOT_FILES, ...LAYERS.map((l) => l + "/")].join("、")}）`);
      if (!entries.some((e) => e.name === "info.ts")) issues.push(`${id}：缺少 info.ts`);
      else if (!registry.includes(`./${id}/info"`)) issues.push(`${id}：還沒登記到 modules/index.ts`);
      if (entries.some((e) => e.name === "cron.ts") && !cronRegistry.includes(`./${id}/cron"`)) issues.push(`${id}：cron.ts 還沒登記到 modules/cron.ts`);
      return issues;
    });
    expect(moduleIds.length).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  // 模組 id 是通知的 module 提醒偏好與 localStorage 的 key 認領與冷卻的 scope
  // 寫錯一個字 提醒方式的開關就對不到那個模組的通知 log 也分不出是誰
  it("模組 id 一致：info.id、通知與 log 的 module、認領與冷卻的 scope 前綴、allhub: 開頭的 localStorage key 都等於資料夾名稱", async () => {
    const SCOPE_FIRST = ["claimOnce", "releaseOnce", "takeCooldown"];
    const SCOPE_OPTION = ["sendOnce", "sendOnceEach", "recordAttempt", "checkAttempts"];
    const problems: string[] = [];
    for (const id of moduleIds) {
      const exported = Object.values((await import(pathToFileURL(path.join(SRC, "modules", id, "info.ts")).href)) as Record<string, { id?: unknown }>);
      const ids = exported.map((info) => info.id);
      if (ids.length !== 1 || ids[0] !== id) problems.push(`modules/${id}/info.ts：id 是 ${ids.join("、") || "（沒有）"}，要等於資料夾名稱 ${id}`);
    }
    for (const file of files.filter((f) => !isTest(f))) {
      const place = placeOf(file);
      if (place.zone !== "module") continue;
      const sourceFile = syntaxOf(file);
      // 同一個檔案裡的常數 例如 MODULE_ID
      const constants = new Map<string, ts.Expression>();
      const collect = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
        ts.forEachChild(node, collect);
      };
      collect(sourceFile);
      const valueOf = (expression: ts.Expression | undefined): string | undefined => {
        if (!expression) return undefined;
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
        if (ts.isTemplateExpression(expression)) return `${expression.head.text}…`;
        if (ts.isIdentifier(expression)) return valueOf(constants.get(expression.text));
        return undefined;
      };
      // 寫成字串或同一個檔案裡的常數才檢查得到
      const check = (node: ts.Node, what: string, value: string | undefined, ok: boolean) => {
        if (!ok) problems.push(`${file}:${lineOf(sourceFile, node)} ${what}：${value ?? `看不出值（${node.getText(sourceFile)}）`}，要用模組 id ${place.id}`);
      };
      const isScope = (value: string | undefined) => value?.startsWith(`${place.id}:`) ?? false;
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === "module") check(node.initializer, "module", valueOf(node.initializer), valueOf(node.initializer) === place.id);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const [arg] = node.arguments;
          const callee = node.expression.text;
          if (callee === "logError") check(arg ?? node, "logError 的 scope", valueOf(arg), valueOf(arg) === place.id);
          if (SCOPE_FIRST.includes(callee)) check(arg ?? node, "scope", valueOf(arg), isScope(valueOf(arg)));
          if (SCOPE_OPTION.includes(callee)) {
            const option = arg && ts.isObjectLiteralExpression(arg) ? arg.properties.find((p) => p.name?.getText(sourceFile) === "scope") : undefined;
            const value = option && ts.isPropertyAssignment(option) ? valueOf(option.initializer) : option && ts.isShorthandPropertyAssignment(option) ? valueOf(option.name) : undefined;
            check(option ?? arg ?? node, "scope", value, isScope(value));
          }
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
          const key = node.text.match(/^allhub:([\w-]+)/)?.[1];
          if (key !== undefined) check(node, "localStorage 的 key", `allhub:${key}`, key === place.id);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(problems).toEqual([]);
    // 要解析每個模組檔 機器忙時預設的 5 秒不夠
  }, 30_000);

  // 規則寫在 CLAUDE.md 的安全 Server Action 可以被直接 POST
  // 只有 requireSession 會比對資料庫 擋下改過密碼的舊 cookie 與停用的帳號
  it("Server Action（use server 檔的每個 export）第一個敘述是 await requireSession() 或 requireOwner()；不用登入的只有 login、registerAction、logout", () => {
    const NO_LOGIN = new Set(["core/auth/actions.ts login", "core/auth/actions.ts registerAction", "core/auth/actions.ts logout"]);
    const LOGIN_FIRST = /^(?:(?:const|let)\s+[^=]+=\s*)?await\s+require(?:Session|Owner)\(\s*\);?$/;
    const problems: string[] = [];
    const serverFiles = files.filter((file) => !isTest(file) && /["']use server["']/.test(read(file)));
    for (const file of serverFiles) {
      const sourceFile = syntaxOf(file);
      const checkBody = (name: string, body: ts.ConciseBody | undefined, node: ts.Node) => {
        if (NO_LOGIN.has(`${file} ${name}`)) return;
        const first = body && ts.isBlock(body) ? body.statements[0]?.getText(sourceFile).replace(/\s+/g, " ") : undefined;
        if (!first || !LOGIN_FIRST.test(first)) problems.push(`${file}:${lineOf(sourceFile, node)} ${name}：第一個敘述要是 await requireSession() 或 await requireOwner()（現在是 ${first ?? "沒有函式本體"}）`);
      };
      // 寫在函式裡的 use server 這條規則看不到 一律放在開頭有 use server 的檔案
      const visit = (node: ts.Node) => {
        const body = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ? node.body : undefined;
        if (body && ts.isBlock(body) && directivesOf(body.statements).includes("use server")) {
          problems.push(`${file}:${lineOf(sourceFile, node)}：Server Action 要寫在開頭有 "use server" 的檔案（例如 web/actions.ts），登入檢查才看得到`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      if (!directivesOf(sourceFile.statements).includes("use server")) continue;
      for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)) {
          if (!statement.isTypeOnly) problems.push(`${file}:${lineOf(sourceFile, statement)}：用 export { … } 匯出的 action 看不到開頭，請寫成 export async function`);
          continue;
        }
        if (ts.isExportAssignment(statement)) {
          problems.push(`${file}:${lineOf(sourceFile, statement)}：不要用 export default，請寫成 export async function`);
          continue;
        }
        const exported = ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
        // 多載只是型別宣告 檢查有本體的那一個
        if (ts.isFunctionDeclaration(statement)) {
          if (statement.body) checkBody(statement.name?.text ?? "default", statement.body, statement);
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            const name = declaration.name.getText(sourceFile);
            const init = declaration.initializer;
            if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) checkBody(name, init.body, declaration);
            else problems.push(`${file}:${lineOf(sourceFile, declaration)} ${name}：use server 的檔案只能匯出 async function`);
          }
        } else problems.push(`${file}:${lineOf(sourceFile, statement)}：use server 的檔案只能匯出 async function`);
      }
    }
    // 先確認真的掃到 Server Action 規則才不會因為沒掃到東西而空轉
    expect(serverFiles).toEqual(expect.arrayContaining(["core/auth/actions.ts", "core/admin/actions.ts"]));
    expect(problems).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的 form.ts 加了 use server 每個 export 都會變成可以直接 POST 的 action
  it("core/form.ts 沒有 use server（它只是欄位解析與 runAction，不是 Server Action）", () => {
    expect(directivesOf(syntaxOf("core/form.ts").statements)).not.toContain("use server");
  });

  // vitest.config 只收 .test.ts 寫成別的副檔名的測試不會執行 看起來有測試其實沒有
  it("測試檔一律是 .test.ts（vitest 只跑這種，.test.tsx 這類不會執行）", () => {
    expect([...fileSet].filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".test.ts"))).toEqual([]);
  });

  // core 的 HomePage 只排版不能 import 模組 卡片由 src/app 的首頁組合
  // 漏了就不會出現在首頁
  it("每個模組的首頁卡片（web/pages/home-card.tsx）都組合到首頁（src/app/(main)/page.tsx）", () => {
    const homePage = "app/(main)/page.tsx";
    const composed = new Set(allImports.filter((i) => i.from === homePage).map((i) => i.target));
    const cards = [...fileSet].filter((file) => /^modules\/[^/]+\/web\/pages\/home-card\.tsx$/.test(file));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.filter((card) => !composed.has(card)).map((card) => `${card}：還沒組合到 ${homePage}`)).toEqual([]);
  });

  // 提醒方式依 notifies 決定列哪些模組
  // 沒呼叫 notify 卻列出來會多一排沒用的開關 反過來則是通知關不掉
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

  // 規則寫在 CLAUDE.md 架構規則的 env.ts
  // 環境變數都經過 core/env.ts 驗證 例外只有這裡列的幾種
  it("process.env 只出現在例外的地方：core/env.ts、NODE_ENV、proxy.ts 的 SESSION_SECRET、drizzle.config.ts 的 DATABASE_URL、src/dev 的命令列工具、假外部服務的 MOCK_ 設定、測試檔；node:process 的 env 也算", () => {
    const rootConfigs = fs
      .readdirSync(path.join(SRC, ".."))
      .filter((name) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(name) && !name.endsWith(".d.ts"))
      .map((name) => `../${name}`);
    const scanned = [...[...fileSet].filter((file) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)), ...rootConfigs];
    // 命令列工具是 node 直接執行的入口 有 import.meta.main
    // 假外部服務是 mock:external 載入的檔案
    const isCli = (file: string) => file.startsWith("dev/") && /\bimport\.meta\.main\b/.test(read(file));
    const isMock = (file: string) => file === "dev/mock-external.mjs" || /^modules\/[^/]+\/dev\/mock\.mjs$/.test(file);
    const allowed = (file: string, name: string | undefined): boolean => {
      if (isTest(file) || file === "core/env.ts" || name === "NODE_ENV") return true;
      if (file === "proxy.ts") return name === "SESSION_SECRET";
      if (file === "../drizzle.config.ts") return name === "DATABASE_URL";
      if (isMock(file)) return name?.startsWith("MOCK_") ?? false;
      return isCli(file);
    };
    // import { env } from "node:process" 或整個 process 物件 讀不出變數名稱 只有例外的地方可以用
    const viaModule = /\bfrom\s*["'](?:node:)?process["']|\b(?:import|require)\(\s*["'](?:node:)?process["']\s*\)/;
    const withoutEnv = /^\s*import\s*\{(?![^}]*\benv\b)[^}]*\}\s*from/;
    const uses = scanned.flatMap((file) =>
      read(file)
        .split("\n")
        .flatMap((line, i) => {
          const at = `${file}:${i + 1} ${line.trim()}`;
          const direct = [...line.matchAll(/process\.env(?:\.([A-Za-z_]\w*)|\[\s*["'](\w+)["']\s*\])?/g)].map((m) => ({ file, name: m[1] ?? m[2], at }));
          const indirect = (viaModule.test(line) && !withoutEnv.test(line)) || /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\.)?process\b/.test(line) ? [{ file, name: undefined, at }] : [];
          return [...direct, ...indirect];
        }),
    );

    // 先確認真的掃到已知的用法 規則才不會因為沒掃到東西而空轉
    expect(uses.map((use) => use.file)).toEqual(expect.arrayContaining(["core/env.ts", "proxy.ts", "../drizzle.config.ts", "dev/mock-external.mjs"]));
    expect(uses.filter((use) => !allowed(use.file, use.name)).map((use) => use.at)).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的程式碼慣例 ICU 版本不同時語系輸出的空白字元會變
  // CI 曾因此失敗 所以只取數字欄位自己組
  it("日期時間與數字的顯示不靠語系資料：不直接用 Intl.DateTimeFormat、Intl.RelativeTimeFormat、Intl.NumberFormat 或 toLocale*String（日期用 core/time.ts，千分位用 core/number.ts）", () => {
    const allowed = new Set(["core/time.ts", "dev/icu-simulation.ts"]);
    const offenders = files
      .filter((file) => !isTest(file) && !allowed.has(file))
      .flatMap((file) =>
        read(file)
          .split("\n")
          .flatMap((line, i) => (/\bIntl\.(?:DateTimeFormat|RelativeTimeFormat)\b|\bIntl\.NumberFormat\s*\(|\.toLocale(?:Date|Time)?String\(/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])),
      );
    expect(offenders).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的外部圖片 網站與 Vercel 都不經手圖片
  // 遊戲的固定小圖示與官方標誌也一樣直接畫
  it("next/image 一律加 unoptimized：不經 Vercel 的圖片最佳化", () => {
    const withImages = new Set<string>();
    const problems = files
      .filter((file) => !isTest(file) && /["']next\/image["']/.test(read(file)))
      .flatMap((file) => {
        const local = read(file).match(/\bimport\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*["']next\/image["']/)?.[1];
        if (!local) return [`${file}：用 import Image from "next/image"，這條規則才找得到每個圖片`];
        const sourceFile = syntaxOf(file);
        const found: string[] = [];
        const visit = (node: ts.Node) => {
          if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sourceFile) === local) {
            withImages.add(file);
            const unoptimized = node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sourceFile) === "unoptimized" && (!p.initializer || p.initializer.getText(sourceFile) === "{true}"));
            if (!unoptimized) found.push(`${file}:${lineOf(sourceFile, node)}：<${local}> 要加 unoptimized`);
          } else if (ts.isCallExpression(node) && node.arguments[0]?.getText(sourceFile) === local) {
            withImages.add(file);
            if (!/\bunoptimized\s*:\s*true\b/.test(node.arguments[1]?.getText(sourceFile) ?? "")) found.push(`${file}:${lineOf(sourceFile, node)}：${local} 要加 unoptimized: true`);
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        return found;
      });
    // 先確認真的掃到圖片 規則才不會因為沒掃到東西而空轉
    expect([...withImages]).toContain("core/ui/external-image.tsx");
    expect(problems).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的程式碼慣例 焦點鎖定 Esc 點背景 關閉後還焦點
  // Activity 藏起來時一定關掉 這些都只寫在共用的元件裡
  it("原生的 <dialog> 與 showModal() 只出現在 core/ui/dialog.tsx，其他地方用它的 Dialog／DialogButton", () => {
    const offenders = files
      .filter((file) => !isTest(file) && file !== "core/ui/dialog.tsx")
      .flatMap((file) =>
        read(file)
          .split("\n")
          .flatMap((line, i) => (/<dialog\b|\.showModal\(/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])),
      );
    expect(read("core/ui/dialog.tsx")).toMatch(/<dialog\b[\s\S]*\.showModal\(|\.showModal\([\s\S]*<dialog\b/);
    expect(offenders).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的畫面風格 Activity 藏起來的頁面還留在文件裡
  // :root:has() 會比對到它 PageTheme 在藏起來時標記 選擇器才排除得掉
  it("會換整頁樣式的主題 class（樣式裡的 :root:has(.theme-…)）只放在 core/ui/page-theme.tsx 的 PageTheme 上", () => {
    const css = readStylesheet();
    const pageThemes = [...new Set([...css.matchAll(/(?::root|html|body):has\(\.(theme-[\w-]+)/g)].map((m) => m[1]))];
    const offenders = files
      .filter((file) => !isTest(file) && file.endsWith(".tsx"))
      .flatMap((file) =>
        read(file)
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

  // 規則寫在 CLAUDE.md 的樣式檔 模組的樣式放在模組的 web/
  // Tailwind 編譯 globals.css 時把 @import 換成檔案內容 沒引入的檔不會生效
  it("CSS 只有 src/app/globals.css 與模組 web/ 底下的檔：模組的檔都由 globals.css 引入一次、自己不再引入別的檔，TS 只有 src/app/layout.tsx 引入 globals.css", () => {
    const cssFiles = [...fileSet].filter((file) => file.endsWith(".css"));
    const moduleCss = cssFiles.filter(isModuleCss);
    const misplaced = cssFiles.filter((file) => file !== "app/globals.css" && !isModuleCss(file)).map((file) => `${file}：CSS 放在 src/app/globals.css 或模組的 web/`);
    const nested = moduleCss.filter((file) => /@import\b/.test(read(file))).map((file) => `${file}：模組的 CSS 檔不再引入別的檔`);
    const imports = stylesheetImports();
    const fromTs = files.flatMap((file) => specsOf(file).flatMap(({ spec }) => (spec.endsWith(".css") ? [`${file} → ${spec}`] : [])));

    expect([...misplaced, ...nested]).toEqual([]);
    expect(moduleCss.length).toBeGreaterThan(0);
    expect([...imports].sort()).toEqual([...moduleCss].sort());
    expect(new Set(imports).size).toBe(imports.length);
    expect(fromTs).toEqual(["app/layout.tsx → ./globals.css"]);
  });

  // 模組 CSS 的 class 前綴 新增有樣式的模組時登記一列 前綴不能跟別的模組重疊
  const MODULE_CSS_PREFIXES: Record<string, string[]> = {
    savings: ["fin-"],
    starrail: ["sr-"],
    twitch: ["tw-"],
    youtube: ["yt-", "player-", "subtitle-"],
  };
  const isModuleClass = (name: string) => Object.values(MODULE_CSS_PREFIXES).some((prefixes) => prefixes.some((p) => name.startsWith(p))) || moduleIds.some((id) => name === `theme-${id}`);

  it("模組的 CSS 檔只寫自己模組的 class（前綴登記在 MODULE_CSS_PREFIXES）與自己的 .theme-<id>；core 的 class 只能接在它們的選擇器裡當條件，core 的樣式不放在模組檔裡", () => {
    const moduleCss = [...fileSet].filter(isModuleCss);
    const owners = Object.entries(MODULE_CSS_PREFIXES).flatMap(([id, prefixes]) => prefixes.map((prefix) => ({ id, prefix })));
    const overlaps = owners.flatMap((a) => owners.filter((b) => a !== b && b.prefix.startsWith(a.prefix)).map((b) => `${a.id} 的 ${a.prefix} 跟 ${b.id} 的 ${b.prefix} 重疊`));
    const unused = Object.keys(MODULE_CSS_PREFIXES).filter((id) => !moduleCss.some((file) => file.split("/")[1] === id)).map((id) => `${id}：沒有 CSS 檔，從 MODULE_CSS_PREFIXES 拿掉`);
    const coreClasses = new Set(selectorsOf(read("app/globals.css")).flatMap(classesOf).filter((name) => !isModuleClass(name)));
    const problems = moduleCss.flatMap((file) => {
      const id = file.split("/")[1];
      const prefixes = MODULE_CSS_PREFIXES[id];
      if (!prefixes) return [`${file}：${id} 的前綴還沒登記到 MODULE_CSS_PREFIXES`];
      const own = (name: string) => name === `theme-${id}` || prefixes.some((p) => name.startsWith(p));
      const ownAttribute = (name: string) => name.startsWith("data-") && [...prefixes, `${id}-`].some((p) => name.slice("data-".length).startsWith(p));
      const css = read(file);
      const selectorProblems = selectorsOf(css).flatMap((selector) => {
        const classes = classesOf(selector);
        const strangers = classes.filter((name) => !own(name) && !coreClasses.has(name)).map((name) => `${file}：${selector} 的 .${name} 不是 ${id} 的前綴（${prefixes.join("、")}）也不是 core 的 class`);
        const homeless = classes.some(own) || attributesOf(selector).some(ownAttribute) ? [] : [`${file}：${selector} 沒有 ${id} 自己的 class，core 的樣式寫在 globals.css`];
        return [...strangers, ...homeless];
      });
      // text-sr-gold 這類 class 的顏色也要帶自己的前綴
      const themeVariables = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@theme\b[^{]*\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/(--[\w-]+)\s*:/g)].map((v) => v[1]));
      const themeProblems = themeVariables.filter((name) => !prefixes.some((p) => new RegExp(`^--[a-z]+-${p}`).test(name))).map((name) => `${file}：@theme 的 ${name} 要帶 ${id} 的前綴`);
      return [...selectorProblems, ...themeProblems];
    });

    expect(moduleCss.length).toBeGreaterThan(0);
    expect([...overlaps, ...unused, ...problems]).toEqual([]);
  });

  // globals.css 裡提到模組 class 的只剩這幾條 跟 core 的規則或兩個模組寫在同一個選擇器清單或區塊裡
  // 拆開會改到編譯出來的 CSS 新的模組樣式一律放在模組的 web/
  const SHARED_IN_GLOBALS = [
    ".theme-twitch",
    ".theme-starrail",
    ":root:has(.theme-twitch:not([data-activity-hidden])) .app-header",
    ":root:has(.theme-starrail:not([data-activity-hidden])) .app-header",
    ".tw-card:hover .tw-preview",
    ".yt-pill-sm",
    ".yt-chip",
    ".sr-tab",
  ];

  it("globals.css 只放全站共用的樣式：模組的 class 只出現在共用的幾條（固定深色頁的圖示色與導覽列、減少動態、觸控放大）", () => {
    const found = selectorsOf(read("app/globals.css")).filter((selector) => classesOf(selector).some(isModuleClass));

    expect([...new Set(found)].sort()).toEqual([...SHARED_IN_GLOBALS].sort());
  });

  // 規則在 CLAUDE.md 的間距與對齊 Server Action 表單開頭有隱藏 input
  // 串流中的 Suspense 也會多一個 template 第幾個子元素會算錯
  it("不從外框用子元素的位置排欄（[&>:nth-child()]、[&>:last-child]、*:first: 這類）；[&>:first-child] 只能挑永遠排第一個的 PageHeader", () => {
    const POSITIONAL = /nth-child\(|nth-last-child\(|last-child|only-child|nth-of-type\(|nth-last-of-type\(|first-of-type|last-of-type|only-of-type/;
    // Tailwind 的 *: 是子元素 **: 是子孫 加上 first: nth-2: 這類變體
    // 跟 [&>:first-child] 一樣是從外框挑第幾個
    const CHILD_VARIANT = /(?<![\w-])\*{1,2}:(?:[\w-]+:)*?(?:first|last|only|odd|even|(?:first|last|only)-of-type|nth-[^\s:"'`]+):/g;
    const problems = files
      .filter((file) => !isTest(file))
      .flatMap((file) => {
        const source = read(file);
        const lineAt = (index: number) => source.slice(0, index).split("\n").length;
        const childVariants = [...source.matchAll(CHILD_VARIANT)].map((m) => `${file}:${lineAt(m.index)} ${m[0]}：不能用子元素的位置排欄，col-span 寫在元素自己身上`);
        const outerSelectors = [...source.matchAll(/\[&>[^\]\s"'`]*\]/g)].flatMap((m) => {
          const at = `${file}:${lineAt(m.index)} ${m[0]}`;
          if (POSITIONAL.test(m[0])) return [`${at}：不能用子元素的位置排欄，col-span 寫在元素自己身上`];
          if (!m[0].includes("first-child")) return [];
          // 這個 class 所在的開頭標籤結束後 第一個 JSX 子元素要是 PageHeader
          // 略過空白與 JSX 註解
          const rest = source.slice(m.index + m[0].length);
          const tagEnd = rest.search(/["'`][^>]*?>/);
          const firstChild = tagEnd < 0 ? null : rest.slice(tagEnd).replace(/^["'`][^>]*?>/, "").match(/^(?:\s|\{\/\*[\s\S]*?\*\/\})*<([A-Za-z.]+)/)?.[1];
          return firstChild === "PageHeader" ? [] : [`${at}：[&>:first-child] 只能用在第一個子元素是 <PageHeader> 的外框（這裡是 ${firstChild ?? "看不出來"}）`];
        });
        return [...childVariants, ...outerSelectors];
      });
    expect(problems).toEqual([]);
  });

  // 規則寫在 CLAUDE.md 的程式碼慣例 externalFetch 開發時改送假伺服器又有逾時
  // 直接呼叫全域 fetch 會在 E2E 打到真的服務
  it("正式程式不直接呼叫全域 fetch()：對外請求經 core/external-url 的 externalFetch；例外只有它本身與 client 元件呼叫自家的 /api/", () => {
    const problems = files
      .filter((file) => !isTest(file) && placeOf(file).zone !== "dev" && file !== "core/external-url.ts")
      .flatMap((file) => {
        const source = read(file);
        const isClient = /^\s*["']use client["']/.test(source);
        // 同一個檔案裡寫成常數的自家 API 路徑 例如通知中心的 API 常數
        const apiConstants = new Set([...source.matchAll(/\bconst\s+(\w+)\s*=\s*["'`]\/api\//g)].map((m) => m[1]));
        return [...source.matchAll(/(?<![\w.$])(?:(?:globalThis|window|self)\.)?fetch\(\s*([^,)\s]*)/g)].flatMap((m) => {
          const target = m[1];
          const ownApi = /^["'`]\/api\//.test(target) || apiConstants.has(target);
          if (isClient && ownApi) return [];
          return [`${file}:${source.slice(0, m.index).split("\n").length} ${m[0]}：改用 externalFetch()${ownApi ? "（只有 client 元件可以直接呼叫自家的 /api/）" : ""}`];
        });
      });
    // 先確認掃到已知的例外 通知中心輪詢自家的 API
    // 規則才不會因為沒掃到東西而空轉
    expect(read("core/notifications/center.tsx")).toMatch(/(?<![\w.$])fetch\(API/);
    expect(problems).toEqual([]);
  });

  it("資料表只定義在 core/db/schema.ts 與各模組的 data/schema.ts（drizzle.config.ts 只收這些檔案），表名加前綴", () => {
    const isSchemaFile = (file: string) => file === "core/db/schema.ts" || /^modules\/[^/]+\/data\/schema\.ts$/.test(file);
    const problems = files
      .filter((file) => !isTest(file))
      .flatMap((file) => {
        const tables = [...read(file).matchAll(/\bpgTable\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
        if (tables.length === 0) return [];
        if (!isSchemaFile(file)) return [`${file}：資料表要放在 core/db/schema.ts 或模組的 data/schema.ts`];
        const prefix = file.startsWith("core/") ? "core_" : `${file.split("/")[1]}_`;
        return tables.filter((table) => !table.startsWith(prefix)).map((table) => `${file}：${table} 要以 ${prefix} 開頭`);
      });
    expect(fileSet.has("core/db/schema.ts")).toBe(true);
    expect(problems).toEqual([]);
    const drizzleConfig = read("../drizzle.config.ts");
    expect(drizzleConfig).toContain('"./src/core/db/schema.ts"');
    expect(drizzleConfig).toContain('"./src/modules/*/data/schema.ts"');
  });
});
