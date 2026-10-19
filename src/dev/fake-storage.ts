// localStorage 的替身 用 vi.stubGlobal 換上
// vitest.config 開了 unstubGlobals 每個測試前自動換回來

/** 記在 Map 裡 data 可以直接看存了什麼 或改值模擬別的分頁存的 */
export function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

/** 隱私模式或被瀏覽器擋下 讀寫都丟錯 */
export const brokenStorage = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: (): void => {
    throw new Error("SecurityError");
  },
};

/** 瀏覽器只在其他分頁觸發 storage 事件 用來模擬別的分頁改了設定 清空時 key 是 null */
export const storageEvent = (key: string | null) => Object.assign(new Event("storage"), { key });
