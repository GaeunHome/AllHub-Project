import { describe, expect, it } from "vitest";
import { parseChannelInput, parseGlossary, parseVideoId } from "./parse";

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ?start=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
  ])("%s → %s", (input, expected) => {
    expect(parseVideoId(input)).toBe(expected);
  });

  it.each([
    ["空字串", ""],
    ["其他網站", "https://example.com/watch?v=dQw4w9WgXcQ"],
    ["id 長度不對", "https://youtu.be/short"],
    ["頻道網址", "https://www.youtube.com/@someone"],
    ["含非法字元", "dQw4w9WgX<Q"],
  ])("%s → null", (_name, input) => {
    expect(parseVideoId(input)).toBeNull();
  });
});

describe("parseChannelInput", () => {
  const id = "UC" + "a".repeat(22);

  it.each([
    [id, { kind: "id", channelId: id }],
    [`https://www.youtube.com/channel/${id}`, { kind: "id", channelId: id }],
    [`youtube.com/channel/${id}/videos`, { kind: "id", channelId: id }],
    ["@NewJeans_official", { kind: "handle", handle: "NewJeans_official" }],
    ["https://www.youtube.com/@ive.official/videos", { kind: "handle", handle: "ive.official" }],
    ["https://m.youtube.com/@BLACKPINK", { kind: "handle", handle: "BLACKPINK" }],
  ])("%s", (input, expected) => {
    expect(parseChannelInput(input)).toEqual(expected);
  });

  it.each([
    ["空字串", ""],
    ["不是 UC 開頭的 id", "a".repeat(24)],
    ["影片網址", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["其他網站", "https://example.com/@someone"],
    ["handle 含非法字元", "@bad/handle?"],
  ])("%s → null", (_name, input) => {
    expect(parseChannelInput(input)).toBeNull();
  });

  it.each([
    ["@한국어채널", "한국어채널"],
    ["https://www.youtube.com/@한국어채널/videos", "한국어채널"],
    ["https://www.youtube.com/@%ED%95%9C%EA%B5%AD%EC%96%B4", "한국어"],
    ["@チャンネル_1", "チャンネル_1"],
    ["@뉴진스.official-2", "뉴진스.official-2"],
  ])("Unicode handle：%s", (input, handle) => {
    expect(parseChannelInput(input)).toEqual({ kind: "handle", handle });
  });

  it.each([
    ["中間有空白", "@한국 어"],
    ["太短", "@한국"],
    ["含斜線", "@한국/어"],
    ["其他網站的 Unicode handle", "https://example.com/@한국어채널"],
  ])("Unicode handle 不合法：%s → null", (_name, input) => {
    expect(parseChannelInput(input)).toBeNull();
  });
});

describe("parseGlossary", () => {
  it("每行 韓文=中文，略過空行與格式錯誤的行，去頭尾空白", () => {
    expect(parseGlossary("민지 = 珉池\n\n하니=Hanni\n沒有等號\n=沒有左邊\n오른쪽없음=\n 뉴진스=NewJeans ")).toEqual([
      { source: "민지", target: "珉池" },
      { source: "하니", target: "Hanni" },
      { source: "뉴진스", target: "NewJeans" },
    ]);
  });

  it("右邊可以含等號（只切第一個）", () => {
    expect(parseGlossary("a=b=c")).toEqual([{ source: "a", target: "b=c" }]);
  });

  it("重複的原文以最後一行為準", () => {
    expect(parseGlossary("민지=敏智\n민지=珉池")).toEqual([{ source: "민지", target: "珉池" }]);
  });

  it("接受全形等號＝（中文輸入法常打出全形）", () => {
    expect(parseGlossary("민지＝珉池\n하니 ＝ Hanni")).toEqual([
      { source: "민지", target: "珉池" },
      { source: "하니", target: "Hanni" },
    ]);
  });

  it("半形與全形混用時以第一個等號切開", () => {
    expect(parseGlossary("a＝b=c\nd=e＝f")).toEqual([
      { source: "a", target: "b=c" },
      { source: "d", target: "e＝f" },
    ]);
  });
});
