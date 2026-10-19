// 外部服務的回應沒有保證的格式 讀取時一律檢查型別 讀不到給 null 或空的
// 不 import 任何東西 lib 也能用

/** 一般的物件 陣列與 null 不算 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 不是陣列時當成空的 */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 字串原樣回傳不修剪 只有空白的字串當成沒有
 * allowBlank 時空字串也收 例如測站名稱有就照原文
 */
export function text(value: unknown, { allowBlank = false }: { allowBlank?: boolean } = {}): string | null {
  if (typeof value !== "string") return null;
  return allowBlank || value.trim() !== "" ? value : null;
}

/**
 * 有限的數字或寫成數字的字串 空白字串不算
 * stringsOnly 只收字串 例如氣象署的數值一律寫成字串
 */
export function numberOf(value: unknown, { stringsOnly = false }: { stringsOnly?: boolean } = {}): number | null {
  if (typeof value === "number") return !stringsOnly && Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function boolOf(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * 記下讀不到的欄位路徑 不帶值也不重複
 * log 只記這些 格式改了的時候看得出是哪裡不同
 */
export function createMissing() {
  const missing = new Set<string>();
  return {
    add(path: string): void {
      missing.add(path);
    },
    /** 值是 null 就記下路徑 原樣回傳 */
    need<T>(value: T | null, path: string): T | null {
      if (value === null) missing.add(path);
      return value;
    },
    /** 陣列欄位 不是陣列時當作空的並記下 */
    list(record: Record<string, unknown> | null, key: string, path: string): unknown[] {
      const value = record?.[key];
      if (Array.isArray(value)) return value;
      missing.add(path);
      return [];
    },
    sorted(): string[] {
      return [...missing].sort();
    },
  };
}
