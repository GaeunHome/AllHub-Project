import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 給讀樣式的測試用 Tailwind 編譯時把 @import 的檔換成內容 這裡照做
const SRC = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS = path.join(SRC, "app/globals.css");
const importsIn = () => /^([ \t]*)@import\s+"(\.{1,2}\/[^"]+\.css)";[ \t]*$/gm;

/** globals.css 引入的 CSS 檔 相對 src 的路徑 照引入的順序 */
export function stylesheetImports(file = GLOBALS): string[] {
  return [...fs.readFileSync(file, "utf8").matchAll(importsIn())].map((m) => path.relative(SRC, path.join(path.dirname(file), m[2])).split(path.sep).join("/"));
}

/** globals.css 加上它引入的檔 縮排跟著 @import 那一行 跟寫在同一個檔案時一樣 */
export function readStylesheet(file = GLOBALS): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(importsIn(), (_line, indent: string, spec: string) =>
      readStylesheet(path.join(path.dirname(file), spec))
        .replace(/\n$/, "")
        .replace(/^(?=.)/gm, indent),
    );
}
