import { describe, expect, it } from "vitest";
import { clockToMinutes, formatClock, scheduleDay } from "./schedule";

const item = (id: number, stayMinutes: number, travelMinutes = 0, fixedTime: string | null = null) => ({ id, stayMinutes, travelMinutes, fixedTime });
const clocks = (items: ReturnType<typeof item>[]) => scheduleDay(items).map((row) => `${formatClock(row.arrive)}-${formatClock(row.leave)}`);

describe("一天的時間照順序算出來", () => {
  it("從 9 點開始：停留 60 分鐘、交通 30 分鐘，下一站 10:30 到", () => {
    expect(clocks([item(1, 60), item(2, 90, 30)])).toEqual(["09:00-10:00", "10:30-12:00"]);
  });

  it("換順序時間就跟著變：這是用 Excel 最麻煩的地方", () => {
    const a = item(1, 60);
    const b = item(2, 120, 30);

    expect(clocks([a, b])).toEqual(["09:00-10:00", "10:30-12:30"]);
    expect(clocks([b, a])).toEqual(["09:00-11:00", "11:00-12:00"]);
  });

  it("第一個點的交通不算：沒有上一站", () => {
    expect(clocks([item(1, 60, 45)])).toEqual(["09:00-10:00"]);
  });

  it("第一個點有固定時間就是這一天的開始，不算遲到", () => {
    const [first] = scheduleDay([item(1, 60, 0, "07:30")]);

    expect(first).toMatchObject({ arrive: 450, leave: 510, late: 0, wait: 0 });
  });

  it("中間的固定時間（例如訂位、搭車）：早到就等，時間接在固定時間後面", () => {
    const [, second, third] = scheduleDay([item(1, 60), item(2, 60, 0, "11:00"), item(3, 30, 15)]);

    expect(second).toMatchObject({ arrive: 660, wait: 60, late: 0 });
    expect(third.arrive).toBe(12 * 60 + 15);
  });

  it("來不及：標出晚幾分鐘，後面的時間照實際到達往後推", () => {
    const [, second, third] = scheduleDay([item(1, 180), item(2, 60, 30, "12:00"), item(3, 30)]);

    expect(second).toMatchObject({ arrive: 12 * 60 + 30, late: 30, wait: 0 });
    expect(third.arrive).toBe(13 * 60 + 30);
  });

  it("固定時間讀不懂時照順序排，不會整天壞掉", () => {
    expect(clocks([item(1, 60), item(2, 60, 0, "25:99")])).toEqual(["09:00-10:00", "10:00-11:00"]);
  });

  it("排到半夜以後寫隔天，看得出排太滿", () => {
    expect(clocks([item(1, 900), item(2, 120)])).toEqual(["09:00-隔天 00:00", "隔天 00:00-隔天 02:00"]);
  });
});

describe("時間格式", () => {
  it.each([
    ["00:00", 0],
    ["09:05", 545],
    ["23:59", 1439],
  ])("%s 是 %i 分", (text, minutes) => {
    expect(clockToMinutes(text)).toBe(minutes);
  });

  it.each(["24:00", "9:00", "12:60", "", "abc"])("%s 不是合法時間", (text) => {
    expect(clockToMinutes(text)).toBeNull();
  });
});
