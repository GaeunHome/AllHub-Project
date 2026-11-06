import { describe, expect, it } from "vitest";
import { expenseBoard } from "../expense-view";

const person = (id: string, name: string) => ({ id, username: id, name, avatar: null });
const [ming, hua, mei] = [person("a", "小明"), person("b", "小華"), person("c", "小美")];
const members = [ming, hua, mei];
const yen = { id: 1, title: "晚餐", paidBy: "a", amountCents: 300000, currency: "JPY", rateMicros: 214500, shares: ["a", "b", "c"] };
const taxi = { id: 2, title: "計程車", paidBy: "b", amountCents: 30000, currency: "TWD", rateMicros: 1000000, shares: ["a", "b"] };
const board = (trip: Partial<Parameters<typeof expenseBoard>[0]>, userId = "a") => expenseBoard({ expenses: [], settlements: [], members, people: members, ...trip }, userId);

describe("分帳的畫面", () => {
  it("還沒有帳：標題列不寫數字", () => {
    expect(board({}).summary).toBeNull();
  });

  it("外幣寫原本的金額 右邊是台幣 分的人三個以內寫名字", () => {
    const [row] = board({ expenses: [yen] }).rows;

    expect(row).toMatchObject({ twd: "$644", paid: "小明 付 3,000 日圓", split: "小明、小華、小美 分" });
  });

  it("超過三個人寫人數", () => {
    const four = [...members, person("d", "小玉")];
    const [row] = board({ expenses: [{ ...yen, shares: ["a", "b", "c", "d"] }], members: four, people: four }).rows;

    expect(row.split).toBe("4 人分");
  });

  it("台幣的小數也寫出來", () => {
    expect(board({ expenses: [{ ...taxi, amountCents: 30050 }] }).rows[0].paid).toBe("小華 付 $300.50");
  });

  it("644 三人分 小明自己佔 215 所以收 429", () => {
    expect(board({ expenses: [yen] }).summary).toBe("你會收到 $429");
    expect(board({ expenses: [yen] }, "b").summary).toBe("你要付 $215");
  });

  it("新記的排最上面", () => {
    expect(board({ expenses: [yen, taxi] }).rows.map(({ title }) => title)).toEqual(["計程車", "晚餐"]);
  });

  it("新增時預填這趟同一種貨幣最後用的匯率 台幣不用", () => {
    expect(board({ expenses: [yen, { ...yen, id: 3, rateMicros: 215000 }, taxi] }).rates).toEqual({ JPY: "0.215" });
  });

  it("修改時預填原本打的數字", () => {
    expect(board({ expenses: [{ ...yen, amountCents: 300050 }] }).rows[0].draft).toMatchObject({ amount: "3000.5", rate: "0.2145" });
  });

  it("結清之後：誰給誰消失 都結清了 紀錄留著可以復原", () => {
    const { summary, transfers, settled } = board({ expenses: [taxi], settlements: [{ id: 9, fromUser: "a", toUser: "b", amountTwd: 150 }] });

    expect(summary).toBe("都結清了");
    expect(transfers).toEqual([]);
    expect(settled).toEqual([{ id: 9, text: "小明 給 小華", money: "$150" }]);
  });

  it("自己的帳清了但別人還沒：不說成都結清了", () => {
    expect(board({ expenses: [taxi] }, "c").summary).toBe("你的帳清了");
  });

  it("已經離開的人留在舊帳上：名字照寫 修改時也選得到", () => {
    const [row] = board({ expenses: [taxi], members: [ming], people: [ming, hua] }).rows;

    expect(row.paid).toBe("小華 付 $300");
    expect(row.people.map(({ id }) => id)).toEqual(["a", "b"]);
  });
});
