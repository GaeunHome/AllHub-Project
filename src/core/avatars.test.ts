import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_IDS, avatarOf, avatarSrc } from "./avatars";

const FOLDER = "public/images/avatars";

describe("範例頭像", () => {
  it("清單上的每一個都有圖，資料夾裡也沒有多的圖", () => {
    const files = readdirSync(FOLDER).filter((name) => name !== "LICENSE.md");

    expect(files.toSorted()).toEqual(AVATAR_IDS.map((id) => `${id}.webp`).toSorted());
  });

  // SVG 直接開網址時裡面的腳本會在站上執行 不放
  it("都是真的 WebP 點陣圖", () => {
    for (const id of AVATAR_IDS) {
      const head = readFileSync(`public${avatarSrc(id)}`).subarray(0, 12).toString("latin1");
      expect(head.slice(0, 4) + head.slice(8), id).toBe("RIFFWEBP");
    }
  });

  it("授權全文留在資料夾裡（MIT 要求散布時保留）", () => {
    const license = readFileSync(`${FOLDER}/LICENSE.md`, "utf8");

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) Microsoft Corporation");
    expect(license).toContain("Permission is hereby granted");
  });

  it("認得的回傳 id；沒選、舊值或物件內建的名稱都當成沒有頭像", () => {
    expect(avatarOf("cat")).toBe("cat");
    for (const value of [null, undefined, "", "unknown", "constructor", "__proto__", "../secret"]) expect(avatarOf(value)).toBeNull();
  });
});
