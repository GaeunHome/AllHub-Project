import type { AccountKind } from "./kinds";

// 總覽最上面的開始設定 照著做一遍就知道平常要記什麼

export const SETUP_STEPS = ["deposit", "credit", "investment", "salary", "recurring"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export type SetupStatus = { step: SetupStep; done: boolean };

/** 停用的帳戶與規則也算設定過 */
type SetupSources = {
  accounts: readonly { kind: AccountKind }[];
  rules: readonly { allocate: boolean; holdingId: number | null }[];
};

/** 薪水是要分配的收入 定期定額有持股 其他的才算每月固定支出這一步 */
export function setupStatus({ accounts, rules }: SetupSources): SetupStatus[] {
  const hasAccount = (kind: AccountKind) => accounts.some((account) => account.kind === kind);
  const done: Record<SetupStep, boolean> = {
    deposit: hasAccount("deposit"),
    credit: hasAccount("credit"),
    investment: hasAccount("investment"),
    salary: rules.some((rule) => rule.allocate),
    recurring: rules.some((rule) => !rule.allocate && rule.holdingId === null),
  };
  return SETUP_STEPS.map((step) => ({ step, done: done[step] }));
}

/** 略過的步驟存成用逗號隔開的字串 認不得的與重複的拿掉 */
export function parseSkippedSteps(stored: string): SetupStep[] {
  const listed = new Set(stored.split(","));
  return SETUP_STEPS.filter((step) => listed.has(step));
}

export function serializeSkippedSteps(steps: readonly SetupStep[]): string {
  return SETUP_STEPS.filter((step) => steps.includes(step)).join(",");
}

/** 還沒做也沒略過的步驟 沒有了就不必再出現 */
export function remainingSteps(status: readonly SetupStatus[], skipped: readonly SetupStep[]): SetupStep[] {
  return status.filter((item) => !item.done && !skipped.includes(item.step)).map((item) => item.step);
}
