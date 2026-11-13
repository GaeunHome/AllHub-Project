import { describe, expect, it } from "vitest";
import type { TripExpense } from "../../service/expenses";
import { expenseBoard } from "../expense-view";

const person = (id: string, name: string) => ({ id, username: id, name, avatar: null });
const [ming, hua, mei] = [person("a", "小明"), person("b", "小華"), person("c", "小美")];
const members = [ming, hua, mei];
const even = (...ids: string[]) => ids.map((userId) => ({ userId, weight: null }));
const expense = (values: Partial<TripExpense> & Pick<TripExpense, "id" | "title" | "paidBy" | "amountCents">): TripExpense => ({
  currency: "TWD",
  rateMicros: 1000000,
  spentOn: "2026-12-02",
  category: "food",
  split: "even",
  payers: [{ userId: values.paidBy, amountCents: values.amountCents }],
  shares: even("a", "b", "c"),
  ...values,
});
const yen = expense({ id: 1, title: "晚餐", paidBy: "a", amountCents: 300000, currency: "JPY", rateMicros: 214500 });
const taxi = expense({ id: 2, title: "計程車", paidBy: "b", amountCents: 30000, category: "transport", shares: even("a", "b") });
const board = (trip: Partial<Parameters<typeof expenseBoard>[0]>, userId = "a") =>
  expenseBoard({ title: "京都五日遊", startDate: "2026-12-01", endDate: "2026-12-05", expenses: [], settlements: [], members, people: members, ...trip }, userId);
const allRows = (trip: Partial<Parameters<typeof expenseBoard>[0]>) => board(trip).days.flatMap(({ rows }) => rows);

describe("分帳的畫面", () => {
  it("還沒有帳：標題列與總共都不寫數字，也沒有複製的文字", () => {
    expect(board({})).toMatchObject({ summary: null, total: null, copyText: null });
  });

  it("外幣寫原本的金額 右邊是台幣 平分的人三個以內寫名字", () => {
    const [row] = allRows({ expenses: [yen] });

    expect(row).toMatchObject({ twd: "$644", paid: "小明 付 3,000 日圓", split: "小明、小華、小美 平分" });
  });

  it("超過三個人寫人數；照金額與照比例寫出分法", () => {
    const four = [...members, person("d", "小玉")];
    const rows = allRows({
      members: four,
      people: four,
      expenses: [
        { ...yen, shares: even("a", "b", "c", "d") },
        { ...taxi, id: 3, split: "amount", shares: [{ userId: "a", weight: 20000 }, { userId: "b", weight: 10000 }] },
        { ...taxi, id: 4, split: "ratio", shares: [{ userId: "a", weight: 2 }, { userId: "b", weight: 1 }] },
      ],
    });

    expect(rows.map(({ split }) => split)).toEqual(["小明 2 份、小華 1 份", "照金額分給 小明、小華", "4 人平分"]);
  });

  it("好幾個人付：寫出每個人付多少", () => {
    const hotel = expense({ id: 5, title: "住宿", paidBy: "a", amountCents: 900000, payers: [{ userId: "a", amountCents: 600000 }, { userId: "b", amountCents: 300000 }] });

    expect(allRows({ expenses: [hotel] })[0].paid).toBe("小明 付 $6,000、小華 付 $3,000");
  });

  it("台幣的小數也寫出來", () => {
    expect(allRows({ expenses: [{ ...taxi, amountCents: 30050, payers: [{ userId: "b", amountCents: 30050 }] }] })[0].paid).toBe("小華 付 $300.50");
  });

  it("644 三人分 小明自己佔 215 所以收 429", () => {
    expect(board({ expenses: [yen] }).summary).toBe("你會收到 $429");
    expect(board({ expenses: [yen] }, "b").summary).toBe("你要付 $215");
  });

  it("每一筆照日期分組，新的日子在上面；出發前的併成一組，沒有日期的舊帳排最後；同一天新記的在上面", () => {
    const days = board({
      expenses: [
        { ...yen, id: 1, spentOn: "2026-11-02", title: "機票" },
        { ...yen, id: 2, spentOn: "2026-12-02", title: "午餐" },
        { ...yen, id: 3, spentOn: null, title: "舊的帳" },
        { ...yen, id: 4, spentOn: "2026-12-03", title: "門票" },
        { ...yen, id: 5, spentOn: "2026-10-20", title: "飯店訂金" },
        { ...yen, id: 6, spentOn: "2026-12-02", title: "晚餐" },
      ],
    }).days;

    expect(days.map(({ label, rows }) => [label, rows.map(({ title }) => title)])).toEqual([
      ["12/3（四）", ["門票"]],
      ["12/2（三）", ["晚餐", "午餐"]],
      ["出發前", ["機票", "飯店訂金"]],
      ["沒有日期", ["舊的帳"]],
    ]);
  });

  it("這趟總共與各類別：照台幣加起來，多的在前面，沒有類別的舊帳算其他", () => {
    const { total, categories } = board({ expenses: [yen, taxi, { ...taxi, id: 3, category: null, amountCents: 10000, payers: [{ userId: "b", amountCents: 10000 }] }] });

    expect(total).toBe("$1,044");
    expect(categories).toEqual([
      { category: "food", label: "餐飲", money: "$644" },
      { category: "transport", label: "交通", money: "$300" },
      { category: "other", label: "其他", money: "$100" },
    ]);
  });

  it("每個人：付了、分攤與差額（扣掉已經還的錢），同行的人都列出來", () => {
    const people = board({ expenses: [taxi], settlements: [{ id: 9, fromUser: "a", toUser: "b", amountTwd: 100 }] }).people;

    expect(people.map(({ name, paid, share, balance }) => [name, paid, share, balance])).toEqual([
      ["小明", "$0", "$150", "付 $50"],
      ["小華", "$300", "$150", "收 $50"],
      ["小美", "$0", "$0", "清了"],
    ]);
  });

  it("點一個人看明細：他付的、他分到的與還款", () => {
    const [mingRow, huaRow] = board({ expenses: [yen, taxi], settlements: [{ id: 9, fromUser: "a", toUser: "b", amountTwd: 100 }] }).people;

    expect(mingRow.detail).toEqual({
      paid: [{ text: "晚餐", money: "$644" }],
      shares: [
        { text: "計程車", money: "$150" },
        { text: "晚餐", money: "$215" },
      ],
      repayments: [{ text: "給 小華", money: "$100" }],
    });
    expect(huaRow.detail.repayments).toEqual([{ text: "小明 給的", money: "$100" }]);
  });

  it("複製結算：旅程名稱、總共與誰給誰，貼到 LINE 給大家看", () => {
    expect(board({ expenses: [yen] }).copyText).toBe("京都五日遊 分帳\n這趟總共 $644\n小華 給 小明 $215\n小美 給 小明 $214");
  });

  it("都還清了：複製的文字寫都結清了", () => {
    expect(board({ expenses: [taxi], settlements: [{ id: 9, fromUser: "a", toUser: "b", amountTwd: 150 }] }).copyText).toBe("京都五日遊 分帳\n這趟總共 $300\n都結清了");
  });

  it("修改時預填原本的內容：照比例的份數、好幾個人付的金額、日期與類別；舊帳沒有日期時留空、類別是其他", () => {
    const hotel = expense({ id: 5, title: "住宿", paidBy: "a", amountCents: 900050, split: "ratio", shares: [{ userId: "a", weight: 2 }], payers: [{ userId: "a", amountCents: 600050 }, { userId: "b", amountCents: 300000 }] });
    const [hotelRow, oldRow] = allRows({ expenses: [{ ...taxi, spentOn: null, category: null }, hotel] });

    expect(hotelRow.draft).toMatchObject({ amount: "9000.5", spentOn: "2026-12-02", category: "food", payerMode: "many", paid: { a: "6000.5", b: "3000" }, split: "ratio", portions: { a: "2" } });
    expect(oldRow.draft).toMatchObject({ spentOn: "", category: "other", payerMode: "one", paidBy: "b", split: "even", shares: ["a", "b"] });
  });

  it("還清之後：誰給誰消失 都結清了 紀錄留著可以復原", () => {
    const { summary, transfers, settled } = board({ expenses: [taxi], settlements: [{ id: 9, fromUser: "a", toUser: "b", amountTwd: 150 }] });

    expect(summary).toBe("都結清了");
    expect(transfers).toEqual([]);
    expect(settled).toEqual([{ id: 9, text: "小明 給 小華", money: "$150" }]);
  });

  it("自己的帳清了但別人還沒：不說成都結清了", () => {
    expect(board({ expenses: [taxi] }, "c").summary).toBe("你的帳清了");
  });

  it("已經離開的人留在舊帳上：名字照寫 修改時也選得到 每個人的帳也列出來", () => {
    const view = board({ expenses: [taxi], members: [ming], people: [ming, hua] });

    expect(view.days[0].rows[0].paid).toBe("小華 付 $300");
    expect(view.days[0].rows[0].people.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(view.people.map(({ name }) => name)).toEqual(["小明", "小華"]);
  });
});
