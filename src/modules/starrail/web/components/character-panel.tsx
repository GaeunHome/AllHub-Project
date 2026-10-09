import { after } from "next/server";
import { requireSession } from "@/core/auth";
import { logError } from "@/core/errors";
import { externalAssetUrl } from "@/core/external-url";
import { FormMessage } from "@/core/ui/form-message";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTaipeiTime } from "../../lib/responses";
import { syncCookieInvalid, type StarrailAccountView } from "../../service/accounts";
import { cachedCharacters } from "../../service/cached";
import { characterAssetUrls } from "../character-assets";
import { CharacterBrowser } from "./character-browser";

/** 角色列表（每個帳號快取 30 分鐘）；HoYoLAB 失敗時只在這一塊顯示錯誤 */
export async function CharacterPanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedCharacters(user.id, account.id);
  // 快取函式裡不能寫入：跟即時便箋一樣，cookie 狀態不同時在回應送出後再寫回
  if (result.cookieInvalid !== account.cookieInvalid) {
    after(() => syncCookieInvalid(user.id, account.id, result.cookieInvalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
  }

  if (!result.ok || result.characters.length === 0) {
    return (
      <section className="stack">
        <h3 className="sr-title">角色</h3>
        {result.ok ? <p className="sr-panel p-5 text-ink-soft sm:p-6">HoYoLAB 沒有回傳任何角色。</p> : <FormMessage tone="error">{result.message}</FormMessage>}
      </section>
    );
  }
  return <CharacterBrowser characters={characterAssetUrls(result.characters, externalAssetUrl)} fetchedLabel={formatTaipeiTime(result.fetchedAt, new Date())} />;
}

// 角色資料要等 HoYoLAB 回應，除了骨架也寫出正在做什麼
export function CharacterPanelSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢角色資料…" className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 className="sr-title">角色</h3>
        <span aria-hidden className="text-sm text-ink-soft">
          向 HoYoLAB 查詢中…
        </span>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
