import "server-only";

// 外部服務的 OAuth token 記在記憶體 TDX 與 Twitch 共用
// serverless 每個實例各自一份 冷啟動時重拿一次

/** OAuth 回應的欄位 expires_in 是秒 */
export type OAuthToken = { access_token: string; expires_in: number };

export type TokenCache = {
  /** 快到期前 refreshMarginMs 就重拿 同時要的共用同一個請求 */
  get(): Promise<string>;
  /** 對方提早作廢時丟掉 下一次重拿 */
  invalidate(): void;
  /** 測試之間清掉 拿到一半的請求也不算 */
  reset(): void;
};

export function createTokenCache(fetchToken: () => Promise<OAuthToken>, refreshMarginMs: number): TokenCache {
  let token: { value: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;

  function request(): Promise<string> {
    const current: Promise<string> = fetchToken()
      .then(({ access_token, expires_in }) => {
        // reset 之後才回來的不記 免得蓋掉新的狀態
        if (pending === current) token = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
        return access_token;
      })
      .finally(() => {
        if (pending === current) pending = undefined;
      });
    return current;
  }

  return {
    get() {
      if (token && Date.now() < token.expiresAt - refreshMarginMs) return Promise.resolve(token.value);
      pending ??= request();
      return pending;
    },
    invalidate() {
      token = undefined;
    },
    reset() {
      token = undefined;
      pending = undefined;
    },
  };
}
