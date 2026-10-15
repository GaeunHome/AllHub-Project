// 錯誤的 message 可能夾帶憑證 SQL 參數或外部回應原文 log 一律只記種類
// 這個檔不 import 任何東西 哪裡都能用

/** DecryptionError 記原因代碼 換金鑰後才看得出是哪種解不開 其他錯誤記 name */
export function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const reason = (error as { reason?: unknown }).reason;
  return error.name === "DecryptionError" && typeof reason === "string" ? reason : error.name;
}

/** 連線錯誤給畫面看的中文摘要 原文是英文 其他種類回 null 由呼叫端自己給摘要 */
export function connectionProblem(error: unknown, service: string): string | null {
  switch (errorKind(error)) {
    case "TimeoutError":
      return "連線逾時，稍後會自動重試";
    case "AbortError":
      return "連線中斷，稍後會自動重試";
    case "TypeError":
      return `連不上 ${service}，稍後會自動重試`;
    default:
      return null;
  }
}

/** 印出 scope 與做什麼失敗 加上 uid 或狀態碼這類識別資訊與錯誤種類 */
export function logError(scope: string, what: string, error: unknown, ...context: Array<string | number | null>): void {
  console.error(`[${scope}] ${what}`, ...context, errorKind(error));
}
