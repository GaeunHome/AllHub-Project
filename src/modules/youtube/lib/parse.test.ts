import { describe, expect, it } from "vitest";
import { GLOSSARY_LIMITS, classifyYoutubeInput, glossaryProblem, parseChannelInput, parseGlossary, parseVideoId, relevantGlossary } from "./parse";

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

describe("glossaryProblem：專有名詞表的上限（每批都會送給 AI，太大會讓每個接著翻的人多花錢）", () => {
  const entry = (i: number, source = `이름${i}`, target = `名字${i}`) => ({ source, target });
  const many = (n: number) => Array.from({ length: n }, (_, i) => entry(i));

  it("上限是 200 筆、每個詞 50 字、合計 5,000 字", () => {
    expect(GLOSSARY_LIMITS).toEqual({ entries: 200, termLength: 50, totalLength: 5000 });
  });

  it("在上限內_沒有問題（剛好 200 筆、剛好 50 字也可以）", () => {
    expect(glossaryProblem([])).toBeNull();
    expect(glossaryProblem(many(200))).toBeNull();
    expect(glossaryProblem([entry(0, "가".repeat(50), "中".repeat(50))])).toBeNull();
  });

  it("超過 200 筆_回中文錯誤並說目前幾筆", () => {
    expect(glossaryProblem(many(201))).toBe("專有名詞表最多 200 筆（目前 201 筆），請刪掉用不到的");
  });

  it("韓文或中文超過 50 字_回中文錯誤並指出是哪一筆", () => {
    expect(glossaryProblem([entry(0, "가".repeat(51))])).toBe(`專有名詞表每個詞最多 50 字：「${"가".repeat(10)}…」太長`);
    expect(glossaryProblem([entry(0, "민지", "中".repeat(51))])).toBe("專有名詞表每個詞最多 50 字：「민지」的譯名太長");
  });

  it("字數用看到的字算：emoji 這類兩個 UTF-16 的字也只算一個", () => {
    expect(glossaryProblem([entry(0, "😀".repeat(50))])).toBeNull();
  });

  it("所有詞條的韓文加中文合計超過 5,000 字_回中文錯誤並說目前幾字", () => {
    const long = Array.from({ length: 101 }, (_, i) => entry(i, `${"가".repeat(22)}${String(i).padStart(3, "0")}`, "中".repeat(25)));
    expect(glossaryProblem(long)).toBe("專有名詞表合計最多 5,000 字（目前 5,050 字），請刪掉用不到的");
  });
});

describe("relevantGlossary：送給 AI 時只帶這一批與前後文裡實際出現的詞條", () => {
  const glossary = [
    { source: "지수", target: "Jisoo" },
    { source: "제니", target: "Jennie" },
    { source: "IVE", target: "IVE" },
  ];

  it("只留出現在句子裡的詞條，順序照原本的表", () => {
    expect(relevantGlossary(glossary, ["지수입니다", "제니도 왔어요"])).toEqual(glossary.slice(0, 2));
    expect(relevantGlossary(glossary, ["안녕하세요"])).toEqual([]);
  });

  it("英文不分大小寫", () => {
    expect(relevantGlossary(glossary, ["ive 화이팅"])).toEqual([{ source: "IVE", target: "IVE" }]);
  });

  it("字幕檔是分解形式的韓文（NFD）也比對得到", () => {
    expect(relevantGlossary(glossary, ["지수입니다".normalize("NFD")])).toEqual([{ source: "지수", target: "Jisoo" }]);
  });
});

describe("classifyYoutubeInput：列表頁上方同一個輸入框，影片就開觀看頁、頻道就追蹤", () => {
  const CHANNEL_ID = "UC" + "a".repeat(22);

  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  "],
  ])("影片網址或 11 碼 id_%s", (input) => {
    expect(classifyYoutubeInput(input)).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
  });

  it.each([
    ["@NewJeans_official", { kind: "handle", handle: "NewJeans_official" }],
    ["https://www.youtube.com/@NewJeans_official/videos", { kind: "handle", handle: "NewJeans_official" }],
    [CHANNEL_ID, { kind: "id", channelId: CHANNEL_ID }],
    [`https://www.youtube.com/channel/${CHANNEL_ID}`, { kind: "id", channelId: CHANNEL_ID }],
  ])("頻道_%s", (input, channel) => {
    expect(classifyYoutubeInput(input)).toEqual({ kind: "channel", channel });
  });

  it.each([[""], ["   "], ["뉴진스"], ["https://www.twitch.tv/alice"], ["https://www.youtube.com/feed/subscriptions"]])("看不懂_%j", (input) => {
    expect(classifyYoutubeInput(input)).toEqual({ kind: "invalid" });
  });
});
