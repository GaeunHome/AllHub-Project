import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 使用者要的 註解不要太長 說明方式要統一 規則寫在 CLAUDE.md 的程式碼慣例
// 字串 樣板字串 正規式與 JSX 的字先遮掉 網址裡的 // 才不會被當成註解
const SRC = join(import.meta.dirname, "..");
const SOURCE = /\.(ts|tsx|mjs|css)$/;
const PUNCTUATION = /[，。、；：「」『』！？（）…]/;
const DIRECTIVE = /^\s*(?:eslint-|@ts-|\/\s*<)/;
const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText,
]);

type Group = { line: number; lines: string[] };

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });

// 換成等長的空白 位置與行號不變
function masked(file: string, text: string): string {
  if (file.endsWith(".css")) return text.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (quoted) => " ".repeat(quoted.length));
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const chars = text.split("");
  const visit = (node: ts.Node): void => {
    if (LITERALS.has(node.kind)) for (let i = node.getStart(source); i < node.end; i++) if (chars[i] !== "\n") chars[i] = " ";
    ts.forEachChild(node, visit);
  };
  visit(source);
  return chars.join("");
}

// 相鄰而且縮排一樣的單行註解算同一段 CSS 與 JSX 的 /* */ 也是
function commentGroups(file: string, text: string): Group[] {
  const code = masked(file, text);
  const groups: Group[] = [];
  let open: { group: Group; lastLine: number; indent: number; block: boolean } | null = null;
  let line = 1;
  let counted = 0;
  const lineAt = (pos: number) => {
    for (; counted < pos; counted++) if (text[counted] === "\n") line++;
    return line;
  };
  for (let i = 0; i < code.length; i++) {
    const block = code.startsWith("/*", i);
    if (!block && (file.endsWith(".css") || !code.startsWith("//", i))) continue;
    const close = block ? code.indexOf("*/", i + 2) : code.indexOf("\n", i);
    const end = close < 0 ? code.length : block ? close + 2 : close;
    const body = text.slice(i + 2, block ? Math.max(i + 2, end - 2) : end);
    const before = text.slice(text.lastIndexOf("\n", i - 1) + 1, i);
    const lineEnd = text.indexOf("\n", end);
    const after = text.slice(end, lineEnd < 0 ? text.length : lineEnd);
    const first = lineAt(i);
    const last = lineAt(end);
    i = end - 1;
    if (DIRECTIVE.test(body)) {
      open = null;
      continue;
    }
    const lines = body
      .split("\n")
      .map((part) => part.replace(/^\s*\*?/, "").replace(/\*+$/, "").trim())
      .filter(Boolean);
    const joinable = /^\s*\{?\s*$/.test(before) && first === last && /^\s*\}?\s*$/.test(after);
    if (open && joinable && open.lastLine === first - 1 && open.indent === before.length && open.block === block) {
      open.group.lines.push(...lines);
      open.lastLine = first;
      continue;
    }
    const group = { line: first, lines };
    groups.push(group);
    open = joinable ? { group, lastLine: first, indent: before.length, block } : null;
  }
  return groups;
}

const tooLong = <T extends Group>(groups: T[]) => groups.filter((group) => group.lines.length > 2);
const punctuated = <T extends Group>(groups: T[]) => groups.filter((group) => PUNCTUATION.test(group.lines.join("")));

const everyGroup = sourceFiles(SRC).flatMap((file) =>
  commentGroups(file, readFileSync(file, "utf8")).map((group) => ({ ...group, where: `${relative(SRC, file)}:${group.line}` })),
);

describe("註解短而統一", () => {
  it("掃描器分得出註解：三行的與全形標點抓得到，字串、樣板字串、正規式與 JSX 裡的 // 不算", () => {
    const sample = [
      'const a = "https://example.com"; // 網址在字串裡',
      "const b = `http://${a}//`;",
      "const c = /\\/\\/ /;",
      "const d = <p>http://example.com</p>;",
      "// 第一行",
      "// 第二行",
      "// 第三行",
      "{/* 用了，全形標點 */}",
      "// eslint-disable-next-line no-console",
    ].join("\n");
    const groups = commentGroups("sample.tsx", sample);

    expect(groups).toEqual([
      { line: 1, lines: ["網址在字串裡"] },
      { line: 5, lines: ["第一行", "第二行", "第三行"] },
      { line: 8, lines: ["用了，全形標點"] },
    ]);
    expect(tooLong(groups).map((group) => group.line)).toEqual([5]);
    expect(punctuated(groups).map((group) => group.line)).toEqual([8]);
  });

  it("註解最多兩行（CLAUDE.md〈程式碼慣例〉），更長的說明寫進 CLAUDE.md 或 docs", () => {
    expect(tooLong(everyGroup).map((group) => group.where)).toEqual([]);
  });

  it("註解不用全形標點（CLAUDE.md〈程式碼慣例〉），片語之間用空格隔開", () => {
    expect(punctuated(everyGroup).map((group) => group.where)).toEqual([]);
  });
});
