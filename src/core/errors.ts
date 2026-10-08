// 錯誤的 message 可能夾帶憑證、SQL 與參數（金鑰密文、整份字幕）或外部服務的回應原文，log 一律只記錯誤種類；這個檔不 import 任何東西，哪裡都能用

/** DecryptionError 記原因代碼（malformed、unknown_key、auth_failed），換金鑰後才看得出是哪一種解不開；其他錯誤記 name */
export function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const reason = (error as { reason?: unknown }).reason;
  return error.name === "DecryptionError" && typeof reason === "string" ? reason : error.name;
}

/** 連線層的錯誤給畫面看的中文摘要（逾時的原文是英文）；其他種類回 null，由呼叫端依自己的錯誤類別給摘要 */
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

/** 印出「[scope] 做什麼失敗」、附帶的識別資訊（帳號 uid、狀態碼…）與錯誤種類 */
export function logError(scope: string, what: string, error: unknown, ...context: Array<string | number | null>): void {
  console.error(`[${scope}] ${what}`, ...context, errorKind(error));
}
