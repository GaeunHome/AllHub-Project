import { describe, expect, it } from "vitest";
import { NOTIFY_OPTIONS, latestDate, nextOccurrence, parseReminder } from "../rules";

const TODAY = "2026-11-02";
const parse = (fields: Partial<Parameters<typeof parseReminder>[0]>, today = TODAY) => parseReminder({ title: "繳房屋稅", date: "2026-11-30", notify: "0", ...fields }, today);
const errorOf = (fields: Partial<Parameters<typeof parseReminder>[0]>, today = TODAY) => {
  const result = parse(fields, today);
  return result.ok ? null : result.error;
};
const titleOf = (title: string) => {
  const result = parse({ title });
  return result.ok ? result.value.title : null;
};

describe("標題", () => {
  it("NFC 正規化、去掉頭尾空白、連續空白縮成一個（全形空白與換行也是空白）", () => {
    // e 加上組合用的重音符號是兩個字元 NFC 後是一個 é
    expect(titleOf("  é 媽媽　　 生日\n快樂 ")).toBe("é 媽媽 生日 快樂");
  });

  it("1～30 字：去掉空白後是空的不行；一個 emoji 算一個字，組合用的重音符號併進前一個字", () => {
    expect(errorOf({ title: " 　\n " })).toBe("請輸入標題");
    expect(titleOf("字")).toBe("字");
    expect(titleOf("字".repeat(30))).toBe("字".repeat(30));
    expect(errorOf({ title: "字".repeat(31) })).toBe("標題最多 30 個字");
    expect(titleOf("🎂".repeat(30))).toBe("🎂".repeat(30));
    expect(titleOf("é".repeat(30))).toBe("é".repeat(30));
    expect(titleOf(`  ${"字".repeat(30)}  `)).toBe("字".repeat(30));
  });
});

describe("日期", () => {
  it("要是真實存在的日期：格式不對、月份或日子超過都拒絕", () => {
    for (const date of ["", "明天", "2026-13-01", "2026-00-10", "2026-11-31", "2027-02-29", "2026-11-2", "2026/11/30", "2026-11-30T00:00:00Z"]) {
      expect(errorOf({ date }), date).toBe("請選擇正確的日期");
    }
    expect(errorOf({ date: "2028-02-29" })).toBeNull();
  });

  it("今天可以，昨天不行", () => {
    expect(errorOf({ date: TODAY })).toBeNull();
    expect(errorOf({ date: "2026-11-01" })).toBe("日期不能早於今天");
  });

  it("最多到今天起 10 年：10 年後的同一天可以，再隔一天不行", () => {
    expect(errorOf({ date: "2036-11-02" })).toBeNull();
    expect(errorOf({ date: "2036-11-03" })).toBe("日期最多到 10 年後");
  });

  it("閏年的 2/29 起算：10 年後沒有那一天，最多到 2/28", () => {
    expect(latestDate("2028-02-29")).toBe("2038-02-28");
    expect(errorOf({ date: "2038-02-28" }, "2028-02-29")).toBeNull();
    expect(errorOf({ date: "2038-03-01" }, "2028-02-29")).toBe("日期最多到 10 年後");
  });
});

describe("通知選項", () => {
  it("不通知、當天、前 1／3／7／14／30 天：下拉選單照這個順序", () => {
    expect(NOTIFY_OPTIONS.map((option) => option.label)).toEqual(["不通知", "當天", "前 1 天", "前 3 天", "前 7 天", "前 14 天", "前 30 天"]);
  });

  it("選單的每一個選項都解析得回資料表的值：不通知是 null，其他是提前的天數", () => {
    const values = NOTIFY_OPTIONS.map(({ value }) => {
      const result = parse({ notify: value });
      return result.ok ? result.value.notifyDaysBefore : "拒絕";
    });

    expect(values).toEqual([null, 0, 1, 3, 7, 14, 30]);
  });

  it("清單以外的值拒絕：資料庫的 check 只收這幾個，Server Action 又可以直接 POST", () => {
    for (const notify of ["", "2", "-1", "0.5", "30天", "null"]) expect(errorOf({ notify }), notify).toBe("請從清單選擇通知時間");
  });
});

describe("重複", () => {
  it("沒選是不重複 只收每月與每年", () => {
    expect(parse({}).ok && (parse({}) as { value: { repeat: string } }).value.repeat).toBe("none");
    expect(parse({ repeat: "yearly" })).toMatchObject({ ok: true, value: { repeat: "yearly" } });
    expect(errorOf({ repeat: "weekly" })).toBe("請從清單選擇重複的方式");
  });
});

describe("nextOccurrence：下一次是哪一天", () => {
  const next = (date: string, repeat: "none" | "monthly" | "yearly", today: string) => nextOccurrence({ date, repeat }, today);

  it("不重複 當天還在 隔天沒有下一次", () => {
    expect(next("2026-11-30", "none", "2026-11-30")).toBe("2026-11-30");
    expect(next("2026-11-30", "none", "2026-12-01")).toBeNull();
  });

  it("還沒到第一次 就是第一次", () => {
    expect(next("2026-12-15", "monthly", "2026-11-02")).toBe("2026-12-15");
    expect(next("2027-03-01", "yearly", "2026-11-02")).toBe("2027-03-01");
  });

  it.each([
    ["2026-02-01", "2026-02-28", "2 月沒有 31 號 算月底"],
    ["2026-02-28", "2026-02-28", "今天也算"],
    ["2026-03-01", "2026-03-31", "下個月又回到 31 號 不會變成 28 號"],
    ["2026-04-01", "2026-04-30", "4 月只有 30 天"],
    ["2026-12-31", "2026-12-31", "年底"],
    ["2027-01-01", "2027-01-31", "跨年"],
  ])("每月 31 號 今天 %s → %s（%s）", (today, expected) => {
    expect(next("2026-01-31", "monthly", today)).toBe(expected);
  });

  it.each([
    ["2026-01-01", "2026-02-28", "平年沒有 2/29"],
    ["2026-03-01", "2027-02-28", "今年過了 明年"],
    ["2028-01-01", "2028-02-29", "閏年回到 2/29"],
  ])("每年 2/29 今天 %s → %s（%s）", (today, expected) => {
    expect(next("2024-02-29", "yearly", today)).toBe(expected);
  });
});
