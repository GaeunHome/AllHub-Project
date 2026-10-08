import type { ModuleInfo } from "@/core/module";
import { twitchInfo } from "./twitch/info";
import { starrailInfo } from "./starrail/info";
import { youtubeInfo } from "./youtube/info";
import { savingsInfo } from "./savings/info";

/** 新增模組的步驟見 docs/architecture.md「新增模組」；導覽列與首頁依這裡的順序顯示 */
export const modules: ModuleInfo[] = [twitchInfo, youtubeInfo, starrailInfo, savingsInfo];
