import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { mockRequest } from "./mock-request";
import { MoreMenu, menuOf, outsideMenus } from "./more-menu-stub";
import { markup, textOf } from "./test-helpers";

vi.mock("next/navigation", () => import("./navigation-stub"));

const navigation = await import("next/navigation");

describe("textOf：畫面上看得到的字", () => {
  it("React 跳脫過的字元換回原本的字：寫進去什麼就讀到什麼，本來就長得像實體的字也照原樣", () => {
    const written = `A & B <b> "引號" 'O'Neil' &amp; &#39;`;

    expect(textOf(markup(createElement("p", null, written)))).toBe(written);
  });

  it("spaced_每個標籤換成空白再合併，前後有分隔的詞才比對得到", () => {
    const html = markup(createElement("div", null, createElement("span", null, "保留"), createElement("span", null, "3 天前")));

    expect(textOf(html)).toBe("保留3 天前");
    expect(textOf(html, { spaced: true })).toBe(" 保留 3 天前 ");
  });
});

describe("MoreMenu 的替身", () => {
  it("項目直接畫出來；menuOf 用選單的名稱（含引號）找到裡面，outsideMenus 只留列上的部分", () => {
    const label = `「"餐飲"」-$120 的選項`;
    const html = markup(createElement("li", null, createElement(MoreMenu, { label }, createElement("button", null, "刪除")), createElement("span", null, "$120")));

    expect(menuOf(html, label)).toBe("<button>刪除</button>");
    expect(menuOf(html, "別的選項")).toBe("");
    expect(textOf(outsideMenus(html))).toBe("$120");
  });
});

describe("next/navigation 的替身", () => {
  it("redirect 跟真的一樣丟出錯誤，Next 的 unstable_rethrow 認得是轉址", () => {
    let thrown: unknown;
    try {
      navigation.redirect("/login");
    } catch (error) {
      thrown = error;
    }

    expect(String(thrown)).toContain("NEXT_REDIRECT:/login");
    expect(() => navigation.unstable_rethrow(thrown)).toThrow();
    expect(() => navigation.unstable_rethrow(new Error("一般的錯誤"))).not.toThrow();
  });
});

describe("mockRequest：直接呼叫假服務的 handle", () => {
  const handle = ({ req, url, json, image, redirect }: Parameters<Parameters<typeof mockRequest>[0]>[0]) => {
    if (url.pathname === "/json") return json(201, { cookie: req.headers.cookie });
    if (url.pathname === "/avatar") return image("LIVE alice", { width: 640, height: 360 });
    if (url.pathname === "/shorts/x") return redirect(303, "/watch?v=x");
    return false;
  };

  it("跟假伺服器一樣：標頭名稱是小寫、JSON 解析好、圖照網址的大小畫、轉址帶 Location；沒處理的路徑交給下一個模組", async () => {
    expect(await mockRequest(handle, "/json", { headers: { Cookie: "ltuid_v2=1" } })).toMatchObject({ handled: true, status: 201, data: { cookie: "ltuid_v2=1" } });

    const avatar = await mockRequest(handle, "/avatar");
    expect(avatar.image).toEqual({ label: "LIVE alice", width: 640, height: 360 });
    expect(avatar.body).toContain('width="640" height="360"');

    expect(await mockRequest(handle, "/shorts/x")).toMatchObject({ status: 303, headers: { Location: "/watch?v=x" } });
    expect((await mockRequest(handle, "/helix/users")).handled).toBe(false);
  });
});
