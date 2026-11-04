import "server-only";
import { audit, auditActor, type AuditActor } from "./audit";
import { actionErrorMessage, type ActionScope, type IsUserError } from "./form";
import type { FormState } from "./ui/form-message";

type ActionWork = () => Promise<FormState | string | void>;

/** 讀不到登入者或 IP 時不記 不能讓使用者的操作跟著失敗 */
const actorOrNull = (): Promise<AuditActor | null> => auditActor().catch(() => null);

/**
 * 錯誤變成表單訊息 不會跳錯誤畫面 成功失敗都寫進操作紀錄
 * requireSession 與 redirect 會丟出 Next 的內部錯誤 要放在外面呼叫
 */
export async function runAction(scope: ActionScope, work: ActionWork): Promise<FormState>;
export async function runAction(scope: ActionScope, isUserError: IsUserError, work: ActionWork): Promise<FormState>;
export async function runAction(scope: ActionScope, ...args: [ActionWork] | [IsUserError, ActionWork]): Promise<FormState> {
  const [isUserError, work] = args.length === 1 ? [undefined, args[0]] : args;
  // 動作開始前就要讀 刪除帳號之後 session 已經不在了
  const actor = await actorOrNull();
  const state = await settle(scope, isUserError, work);
  if (actor) audit(actor, { module: scope.module, action: scope.action, outcome: state.error ? "failure" : "success", target: scope.target, detail: scope.detail });
  return state;
}

async function settle(scope: ActionScope, isUserError: IsUserError | undefined, work: ActionWork): Promise<FormState> {
  try {
    const result = await work();
    return typeof result === "string" ? { message: result } : (result ?? {});
  } catch (error) {
    return { error: isUserError ? actionErrorMessage(scope, isUserError, error) : actionErrorMessage(scope, error) };
  }
}
