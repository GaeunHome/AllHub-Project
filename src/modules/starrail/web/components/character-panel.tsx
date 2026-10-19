import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { FormMessage } from "@/core/ui/form-message";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { formatTaipeiTime } from "../../lib/responses";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedCharacters } from "../../service/cached";
import { characterAssetUrls } from "../character-assets";
import { CharacterBrowser } from "./character-browser";
import { LoadingTitle, PanelNotice } from "./panel-parts";

/**
 * 角色列表每個帳號快取 30 分鐘 HoYoLAB 失敗時只在這一塊顯示錯誤
 * 帳號的 cookie 失效標記只由即時便箋決定 這裡不動
 */
export async function CharacterPanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedCharacters(user.id, account.id);

  if (!result.ok || result.characters.length === 0) {
    return (
      <PanelNotice title="角色">
        {result.ok ? <p className="sr-panel p-5 text-ink-soft sm:p-6">HoYoLAB 沒有回傳任何角色。</p> : <FormMessage tone="error">{result.message}</FormMessage>}
      </PanelNotice>
    );
  }
  return <CharacterBrowser characters={characterAssetUrls(result.characters, externalAssetUrl)} fetchedLabel={formatTaipeiTime(result.fetchedAt, new Date())} />;
}

export function CharacterPanelSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢角色資料…" className="stack">
      <LoadingTitle title="角色" />
      <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="aspect-square w-full rounded-none" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
