import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { ENDGAME_MODES, type EndgameSchedule } from "../../lib/endgame";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedCharacters, cachedEndgame } from "../../service/cached";
import { endgameAssetUrls } from "../endgame-assets";
import { EndgameView, type EndgameRecord } from "./endgame-view";

const SCHEDULES: EndgameSchedule[] = ["current", "previous"];

/**
 * 三種模式的本期與上期一起查 各自快取 30 分鐘 切換時不用再等
 * 角色名字從同一份快取的角色資料對照 帳號的 cookie 失效標記只由即時便箋決定
 */
export async function EndgamePanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const requests = ENDGAME_MODES.flatMap((mode) => SCHEDULES.map((schedule) => ({ mode, schedule })));
  const [results, characters] = await Promise.all([
    Promise.all(requests.map(({ mode, schedule }) => cachedEndgame(user.id, account.id, mode, schedule))),
    cachedCharacters(user.id, account.id),
  ]);

  const records: EndgameRecord[] = requests.map(({ mode, schedule }, i) => {
    const result = results[i];
    return result.ok ? { mode, schedule, ok: true, endgame: endgameAssetUrls(result.endgame, externalAssetUrl) } : { mode, schedule, ok: false, message: result.message };
  });
  const names = characters.ok ? Object.fromEntries(characters.characters.map((c) => [c.id, c.name])) : {};
  return <EndgameView records={records} names={names} />;
}

export function EndgameSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢終局戰績…" className="stack">
      {/* 標題列跟載入完成時一樣高 並排的開拓月曆標題才對得齊 */}
      <h3 className="sr-title min-h-11">終局戰績</h3>
      <Skeleton className="h-11 w-80 max-w-full rounded-none" />
      <Skeleton className="h-56 rounded-none" />
    </LoadingState>
  );
}
