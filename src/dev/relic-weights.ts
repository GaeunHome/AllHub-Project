// 產生 lib/relic-weights.ts 遺器評分的角色權重來自 hsr-optimizer 每個角色檔的 scoring 授權是 MIT
// 新角色出來時執行 node src/dev/relic-weights.ts 後面可以接 commit 沒給用 main 的最新版

import { writeFileSync } from "node:fs";

const REPO = "fribbels/hsr-optimizer";
const CHARACTER_DIR = /^src\/lib\/conditionals\/character\/\d+\/[^/]+\.ts$/;

// 檔案裡的屬性名稱換成這裡的代號 百分比的副屬性照這個順序存
const SUB_KEYS = { HP_P: "hpP", ATK_P: "atkP", DEF_P: "defP", SPD: "spd", CR: "cr", CD: "cd", EHR: "ehr", RES: "res", BE: "be" } as const;
const MAIN_KEYS: Record<string, string> = {
  ...SUB_KEYS,
  ERR: "err",
  OHB: "ohb",
  Physical_DMG: "physical",
  Fire_DMG: "fire",
  Ice_DMG: "ice",
  Lightning_DMG: "lightning",
  Wind_DMG: "wind",
  Quantum_DMG: "quantum",
  Imaginary_DMG: "imaginary",
};
const PARTS = { Body: "body", Feet: "feet", PlanarSphere: "sphere", LinkRope: "rope" } as const;
const FLAT_KEYS: Record<string, string> = { HP: "hp", ATK: "atk", DEF: "def" };

type Parsed = { id: string; weights: number[]; parts: Record<string, string[]>; flat: string | null };

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${url} 回 ${response.status}`);
  return response.json();
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 回 ${response.status}`);
  return response.text();
}

/** 只認基本版的角色 強化版的 id 帶 b1 HoYoLAB 的角色 id 分不出來 */
export function parseCharacter(source: string, file: string): Parsed | null {
  const id = /^export const \w+: CharacterConfig = \{\s*id: '(\d+)'/m.exec(source)?.[1];
  const start = source.indexOf("const scoring = (): ScoringMetadata => ({");
  if (!id || start < 0) return null;
  const block = source.slice(start, source.indexOf("\n})", start));
  const stats = /\n {2}stats:\s*\{([\s\S]*?)\n {2}\}/.exec(block)?.[1];
  const parts = /\n {2}parts:\s*\{([\s\S]*?)\n {2}\}/.exec(block)?.[1];
  if (!stats || !parts) throw new Error(`${file} 的 scoring 格式不同`);
  const weightOf = Object.fromEntries([...stats.matchAll(/\[Stats\.(\w+)\]:\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  const partLists = Object.fromEntries(
    [...parts.matchAll(/\[Parts\.(\w+)\]:\s*\[([\s\S]*?)\]/g)].flatMap((m) => {
      const part = PARTS[m[1] as keyof typeof PARTS];
      return part ? [[part, [...m[2].matchAll(/Stats\.(\w+)/g)].map((s) => MAIN_KEYS[s[1]] ?? s[1])]] : [];
    }),
  );
  const flat = /\n {2}flatMainstatBoost:\s*Stats\.(\w+)/.exec(block)?.[1];
  return { id, weights: Object.keys(SUB_KEYS).map((key) => weightOf[key] ?? 0), parts: partLists, flat: flat ? FLAT_KEYS[flat] : null };
}

function render(commit: string, characters: Parsed[]): string {
  const rows = characters.map(({ id, weights, parts, flat }) => {
    const list = (part: string) => `[${(parts[part] ?? []).map((key) => `"${key}"`).join(", ")}]`;
    const flatPart = flat ? `, flat: "${flat}"` : "";
    return `  ${id}: { w: [${weights.join(", ")}], body: ${list("body")}, feet: ${list("feet")}, sphere: ${list("sphere")}, rope: ${list("rope")}${flatPart} },`;
  });
  return [
    "// 由 src/dev/relic-weights.ts 從 hsr-optimizer 產生 不要手改 授權是 MIT 全文在 relic-weights.LICENSE.md",
    `// 來源 ${REPO} 的 ${commit.slice(0, 8)}`,
    "",
    "import type { CharacterWeights } from \"./relic-score\";",
    "",
    "/** w 依序是 生命 攻擊 防禦的百分比 速度 暴擊率 暴擊傷害 效果命中 效果抵抗 擊破特攻 */",
    "export const RELIC_WEIGHTS: Readonly<Record<number, CharacterWeights>> = {",
    ...rows,
    "};",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const commit = process.argv[2] ?? ((await getJson(`https://api.github.com/repos/${REPO}/commits/main`)) as { sha: string }).sha;
  const tree = (await getJson(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`)) as { tree: { path: string }[] };
  const files = tree.tree.map(({ path }) => path).filter((path) => CHARACTER_DIR.test(path));
  const characters: Parsed[] = [];
  for (const file of files) {
    const parsed = parseCharacter(await getText(`https://raw.githubusercontent.com/${REPO}/${commit}/${file}`), file);
    if (parsed) characters.push(parsed);
  }
  characters.sort((a, b) => Number(a.id) - Number(b.id));
  writeFileSync(new URL("../modules/starrail/lib/relic-weights.ts", import.meta.url), render(commit, characters));
  console.log(`寫好 ${characters.length} 個角色（${files.length} 個檔，強化版不算）`);
}

if (import.meta.main) await main();
