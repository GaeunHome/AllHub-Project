import { describe, expect, it } from "vitest";
import { SubtitleParseError, decodeSubtitleBytes, parseSubtitles, toSrt, toVtt } from "./format";

describe("parseSubtitles：SRT", () => {
  it("解析多段、多行與 \\r\\n、BOM", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n안녕하세요\r\n여러분\r\n\r\n2\r\n00:01:02,010 --> 00:01:03,000\r\n반가워요\r\n";
    expect(parseSubtitles(srt)).toEqual([
      { start: 1000, end: 2500, text: "안녕하세요\n여러분" },
      { start: 62010, end: 63000, text: "반가워요" },
    ]);
  });

  it("去掉 <i> 等標籤", () => {
    const srt = "1\n00:00:00,000 --> 00:00:01,000\n<i>노래</i> <font color=\"red\">시작</font>\n";
    expect(parseSubtitles(srt)[0].text).toBe("노래 시작");
  });

  it("接受沒有序號的段落與一小時以上的時間", () => {
    const srt = "01:00:00,000 --> 01:00:01,000\n끝\n";
    expect(parseSubtitles(srt)).toEqual([{ start: 3_600_000, end: 3_601_000, text: "끝" }]);
  });
});

describe("parseSubtitles：WebVTT", () => {
  it("略過標頭、NOTE、STYLE，處理 cue settings、cue id、mm:ss.ttt 與 <c> 標籤", () => {
    const vtt = [
      "WEBVTT Kind: captions",
      "Language: ko",
      "",
      "STYLE",
      "::cue { color: white }",
      "",
      "NOTE 這是註解",
      "會跨行",
      "",
      "intro",
      "00:01.000 --> 00:02.000 align:start position:0%",
      "<c.colorE5E5E5>안녕</c><00:00:01.500><c> 하세요</c>",
      "",
      "00:00:03.000 --> 00:00:04.000",
      "<v 지수>둘째 줄</v>",
      "",
    ].join("\n");
    expect(parseSubtitles(vtt)).toEqual([
      { start: 1000, end: 2000, text: "안녕 하세요" },
      { start: 3000, end: 4000, text: "둘째 줄" },
    ]);
  });

  it("解碼常見 HTML 實體", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nA &amp; B &lt;3 &gt; &nbsp;C\n";
    expect(parseSubtitles(vtt)[0].text).toBe("A & B <3 >  C");
  });

  it("略過去掉標籤後是空白的 cue", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\n<c> </c>\n\n00:01.000 --> 00:02.000\n있음\n";
    expect(parseSubtitles(vtt)).toEqual([{ start: 1000, end: 2000, text: "있음" }]);
  });

  it("超出 Unicode 範圍的數字實體保留原文，不丟錯", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nA &#99999999; B &#x110000; C &#x4E2D;\n";
    expect(parseSubtitles(vtt)[0].text).toBe("A &#99999999; B &#x110000; C 中");
  });

  it("NUL 與代理區的數字實體也保留原文（解出來存不進資料庫）", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nA &#0; B &#xD800; C\n";
    expect(parseSubtitles(vtt)[0].text).toBe("A &#0; B &#xD800; C");
  });

  it("分隔行只有空白（不合規範的檔案）時，下一個時間行仍會開始新的 cue", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\n첫째\n \n00:01.000 --> 00:02.000\n둘째\n";
    expect(parseSubtitles(vtt)).toEqual([
      { start: 0, end: 1000, text: "첫째" },
      { start: 1000, end: 2000, text: "둘째" },
    ]);
  });
});

describe("parseSubtitles：yt-dlp 下載的 YouTube 自動字幕（滾動格式）", () => {
  // yt-dlp --write-auto-subs 的實際輸出：第一個 cue 首行是一個空白，每句在下一個 cue 再出現一次當第一行，中間夾 10ms 過場 cue，新的一行帶逐字時間標籤
  const autoVtt = [
    "WEBVTT",
    "Kind: captions",
    "Language: ko",
    "",
    "00:00:00.160 --> 00:00:02.270 align:start position:0%",
    " ",
    "안녕하세요<00:00:00.640><c> 여러분</c><00:00:01.120><c> 오늘은</c>",
    "",
    "00:00:02.270 --> 00:00:02.280 align:start position:0%",
    "안녕하세요 여러분 오늘은",
    " ",
    "",
    "00:00:02.280 --> 00:00:04.990 align:start position:0%",
    "안녕하세요 여러분 오늘은",
    "특별한<00:00:02.800><c> 날이에요</c>",
    "",
    "00:00:04.990 --> 00:00:05.000 align:start position:0%",
    "특별한 날이에요",
    " ",
    "",
    "00:00:05.000 --> 00:00:07.430 align:start position:0%",
    "특별한 날이에요",
    "같이<00:00:05.520><c> 노래해요</c>",
    "",
    "00:00:07.430 --> 00:00:07.440 align:start position:0%",
    "같이 노래해요",
    " ",
    "",
    "00:00:09.000 --> 00:00:10.500 align:start position:0%",
    " ",
    "[음악]",
    "",
  ].join("\n");

  it("每句只出現一次、不掉句，時間沿用原本的 cue", () => {
    expect(parseSubtitles(autoVtt)).toEqual([
      { start: 160, end: 2270, text: "안녕하세요 여러분 오늘은" },
      { start: 2280, end: 4990, text: "특별한 날이에요" },
      { start: 5000, end: 7430, text: "같이 노래해요" },
      { start: 9000, end: 10500, text: "[음악]" },
    ]);
  });

  it("\\r\\n 換行的同樣內容結果相同", () => {
    expect(parseSubtitles(autoVtt.replace(/\n/g, "\r\n"))).toEqual(parseSubtitles(autoVtt));
  });

  it("一般字幕連續兩句相同的單行（例如歌詞重複）都保留", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n사랑해\n\n2\n00:00:02,000 --> 00:00:03,000\n사랑해\n";
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(["사랑해", "사랑해"]);
  });
});

describe("parseSubtitles：順序", () => {
  it("依開始時間排序（播放器用二分搜尋找句子，順序亂掉會找錯）", () => {
    const srt = "1\n00:00:05,000 --> 00:00:06,000\n셋\n\n2\n00:00:01,000 --> 00:00:02,000\n하나\n\n3\n00:00:03,000 --> 00:00:04,000\n둘\n";
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(["하나", "둘", "셋"]);
  });

  it("開始時間相同時保持檔案裡的順序", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\n가\n\n2\n00:00:01,000 --> 00:00:02,000\n나\n";
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(["가", "나"]);
  });
});

describe("parseSubtitles：錯誤", () => {
  it.each([
    ["空字串", ""],
    ["不是字幕", "<html><body>hello</body></html>"],
    ["只有 WEBVTT 標頭", "WEBVTT\n\n"],
  ])("%s → SubtitleParseError", (_name, text) => {
    expect(() => parseSubtitles(text)).toThrow(SubtitleParseError);
  });

  it("時間格式錯誤時丟出中文訊息", () => {
    expect(() => parseSubtitles("1\n00:00:01 --> 00:00:02\n안녕\n")).toThrow(/字幕/);
  });

  it("結束時間早於開始時間 → 錯誤", () => {
    expect(() => parseSubtitles("1\n00:00:02,000 --> 00:00:01,000\n안녕\n")).toThrow(SubtitleParseError);
  });
});

describe("toSrt / toVtt", () => {
  const cues = [
    { start: 1000, end: 2500, text: "你好\n大家" },
    { start: 3_723_004, end: 3_724_000, text: "再見" },
  ];

  it("輸出 SRT", () => {
    expect(toSrt(cues)).toBe(
      "1\n00:00:01,000 --> 00:00:02,500\n你好\n大家\n\n2\n01:02:03,004 --> 01:02:04,000\n再見\n",
    );
  });

  it("輸出 WebVTT", () => {
    expect(toVtt(cues)).toBe(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n你好\n大家\n\n01:02:03.004 --> 01:02:04.000\n再見\n",
    );
  });

  it("輸出後可再解析回同樣內容", () => {
    expect(parseSubtitles(toSrt(cues))).toEqual(cues);
    expect(parseSubtitles(toVtt(cues))).toEqual(cues);
  });

  it("文字中有空行時不會切斷 cue（空行壓成單一換行）", () => {
    const out = toSrt([{ start: 0, end: 1000, text: "a\n\nb" }]);
    expect(parseSubtitles(out)).toEqual([{ start: 0, end: 1000, text: "a\nb" }]);
  });

  it("WebVTT 輸出跳脫 & < >（否則播放器會把 <3 當成標籤吃掉），再解析回原文", () => {
    const out = toVtt([{ start: 0, end: 1000, text: "A & B <3 >_<" }]);
    expect(out).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA &amp; B &lt;3 &gt;_&lt;\n");
    expect(parseSubtitles(out)).toEqual([{ start: 0, end: 1000, text: "A & B <3 >_<" }]);
  });
});

describe("decodeSubtitleBytes", () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("UTF-8 → 原文", () => {
    expect(decodeSubtitleBytes(new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\n안녕하세요\n"))).toBe("1\n00:00:01,000 --> 00:00:02,000\n안녕하세요\n");
  });

  it("CP949（韓文 Windows 記事本的預設存檔）→ 正確的韓文", () => {
    // 「안녕」的 CP949／EUC-KR 編碼是 BE C8 B3 E7
    const bytes = Uint8Array.from([...ascii("1\n00:00:01,000 --> 00:00:02,000\n"), 0xbe, 0xc8, 0xb3, 0xe7, 0x0a]);
    expect(decodeSubtitleBytes(bytes)).toBe("1\n00:00:01,000 --> 00:00:02,000\n안녕\n");
  });

  it("UTF-8 與 CP949 都解不開（例如 UTF-16）→ null", () => {
    expect(decodeSubtitleBytes(Uint8Array.from([0xff, 0xfe, 0x31, 0x00, 0x0a, 0x00]))).toBeNull();
  });

  it("CP949 擴充字（例如「똠」= 8C 63）不會解成亂碼：解得出就是正確的字，解不出就拒絕", () => {
    // Node（ICU）的 euc-kr 不含 CP949 擴充區，會把 8C 當成 C1 控制字元；瀏覽器的 euc-kr 才是完整的 CP949
    expect(["똠", null]).toContain(decodeSubtitleBytes(Uint8Array.from([0x8c, 0x63])));
  });
});
