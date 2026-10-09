// HoYoLAB 的回應沒有公開格式（尚未用真實帳號驗證）：讀取時一律檢查型別，讀不到給 null，並記下欄位路徑

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** 只收 http(s) 網址；協定相對網址補成 https */
export function image(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** 記下讀不到的欄位路徑（不帶值、不重複）：log 只記這些，第一次用真實帳號時看得出格式哪裡不同 */
export function createMissing() {
  const missing = new Set<string>();
  return {
    add(path: string): void {
      missing.add(path);
    },
    /** 值是 null 就記下路徑，原樣回傳 */
    need<T>(value: T | null, path: string): T | null {
      if (value === null) missing.add(path);
      return value;
    },
    /** 陣列欄位；不是陣列時當作空的並記下 */
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
