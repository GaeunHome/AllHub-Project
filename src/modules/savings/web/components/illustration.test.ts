import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup as render } from "@/dev/test-helpers";
import { Illustration, type IllustrationName } from "./illustration";

const DIR = new URL("../../../../../public/illustrations/finance/", import.meta.url);
const NAMES: IllustrationName[] = ["setup", "no-accounts", "no-holdings", "no-recurring", "all-done"];
const fileOf = (name: string) => readFileSync(new URL(`${name}.svg`, DIR), "utf8");

describe("理財的插圖", () => {
  it("每張都有檔案，資料夾裡沒有多的檔", () => {
    expect(readdirSync(DIR).sort()).toEqual(NAMES.map((name) => `${name}.svg`).sort());
  });

  it("檔案裡沒有 script、外部連結或事件屬性，只有畫圖用的元素", () => {
    for (const name of NAMES) {
      const svg = fileOf(name);
      expect(svg).not.toMatch(/<script|<foreignObject|<image|href=|\son[a-z]+=|javascript:|url\(/i);
      // 只有 xmlns 的命名空間網址
      expect(svg.match(/https?:\/\/[^"\s]+/g)).toEqual(["http://www.w3.org/2000/svg"]);
    }
  });

  it("元件引用的是檔案裡的 #art，viewBox 跟檔案一樣（換圖時兩邊一起改）", () => {
    for (const name of NAMES) {
      const svg = fileOf(name);
      const markup = render(createElement(Illustration, { name }));

      expect(svg).toContain('<g id="art">');
      expect(markup).toContain(`href="/illustrations/finance/${name}.svg#art"`);
      expect(markup.match(/viewBox="([^"]+)"/)?.[1]).toBe(svg.match(/<svg[^>]*viewBox="([^"]+)"/)?.[1]);
    }
  });
});
