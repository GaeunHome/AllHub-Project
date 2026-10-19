import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markup as render } from "@/dev/test-helpers";

vi.mock("@/core/ui/external-image", { spy: true });

const { ExternalImage } = await import("@/core/ui/external-image");
const { ElementBadge, GameIcon } = await import("./sr-visuals");

beforeEach(() => {
  vi.mocked(ExternalImage).mockClear();
});

const PATH_ICON = "/icons/starrail/path/hunt.png";
const ELEMENT_ICON = "/icons/starrail/element/quantum.png";

const icon = (src: string | null) => render(createElement(GameIcon, { src, className: "size-3.5" }));
const badge = (src: string | null) => render(createElement(ElementBadge, { element: "quantum", src, decorative: true }));

describe("命途與詞條的小圖示（GameIcon）", () => {
  it("內建的圖示：站內路徑原樣當 src（不經 externalAssetUrl、不改寫到別的網域）；旁邊已經有文字，報讀器不念", () => {
    const markup = icon(PATH_ICON);

    expect(markup).toMatch(/^<img [^>]*src="\/icons\/starrail\/path\/hunt\.png"/);
    expect(markup).toContain('alt=""');
  });

  it("沒有圖示（對照不到的屬性）_整個不畫，不留下空的外框（旁邊的文字不會多縮排一格）", () => {
    expect(icon(null)).toBe("");
  });
});

describe("屬性徽章（ElementBadge）", () => {
  it("有圖示_畫內建的屬性圖示（站內路徑原樣）", () => {
    const markup = badge(ELEMENT_ICON);

    expect(markup).toMatch(/<img [^>]*src="\/icons\/starrail\/element\/quantum\.png"/);
    expect(markup).not.toContain(">量</span>");
  });

  it("沒有圖示（認不得的屬性）_退回屬性色圓加中文第一個字", () => {
    const markup = badge(null);

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">量</span>");
  });
});

describe("遊戲圖示是站內的靜態檔", () => {
  it("用一般的 next/image 畫（跟頁面上方的官方標誌一樣），不走外部圖片的 ExternalImage", () => {
    icon(PATH_ICON);
    badge(ELEMENT_ICON);

    expect(ExternalImage).not.toHaveBeenCalled();
  });
});
