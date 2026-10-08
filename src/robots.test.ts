import { describe, expect, it, vi } from "vitest";

// 根版面會載入 Google 字型，測試只看 metadata，換成假的
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "font-geist" }), Geist_Mono: () => ({ variable: "font-geist-mono" }) }));

const { NO_INDEX, robots } = await import("./core/robots");

describe("防機器人：不讓搜尋引擎收錄", () => {
  it("robots.txt 對所有爬蟲 Disallow 整個網站", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("src/app/robots.ts 只轉接 core 的實作", async () => {
    const route = await import("./app/robots");

    expect(route.default).toBe(robots);
  });

  it("每一頁都帶 noindex、nofollow（根版面的 metadata）", async () => {
    const { metadata } = await import("./app/layout");

    expect(NO_INDEX).toEqual({ index: false, follow: false });
    expect(metadata.robots).toBe(NO_INDEX);
  });
});
