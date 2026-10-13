import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExternalImage } from "./external-image";

const image = (props: Partial<Parameters<typeof ExternalImage>[0]> = {}) =>
  renderToStaticMarkup(createElement(ExternalImage, { src: "https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-640x360.jpg", alt: "", width: 320, height: 180, ...props } as Parameters<typeof ExternalImage>[0])).match(/<img[^>]*>/)![0];

describe("外部圖片（core/ui/external-image）", () => {
  it("預設延遲載入；不經 Vercel 的圖片最佳化、不帶 referrer", () => {
    const img = image();

    expect(img).toContain('loading="lazy"');
    expect(img).toContain('referrerPolicy="no-referrer"');
    expect(img).toContain('src="https://static-cdn.jtvnw.net/previews-ttv/live_user_alice-640x360.jpg"');
  });

  it("畫面最上面一排的縮圖或預覽可以改成立刻載入（eager）：它們常常是最大的內容（LCP），延遲載入會慢一拍", () => {
    expect(image({ loading: "eager" })).toContain('loading="eager"');
  });

  it("沒有網址：顯示替代的內容", () => {
    expect(renderToStaticMarkup(createElement(ExternalImage, { src: null, alt: "", width: 10, height: 10, fallback: createElement("span", null, "文字頭像") }))).toBe("<span>文字頭像</span>");
  });
});
