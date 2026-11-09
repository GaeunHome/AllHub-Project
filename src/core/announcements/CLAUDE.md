# 公告（core/announcements）的注意事項

全站的規則在根目錄的 `CLAUDE.md` 與 `.claude/rules/`（讀寫相關的檔案時自動載入），這裡只寫這個部分自己的。

- 使用者要的：站長在管理頁發布（停止服務、不停機維護、一般公告，`ANNOUNCEMENT_KINDS`），開始與結束時間選填，結束後自動不顯示，發布不發通知，重要的也放在全站最上面的跑馬燈（見下面）。首頁最下面一張清單（`home-announcements.tsx`，使用者選的「場景標題＋圖示列」：標題列跟首頁卡片同一套 `.card-art`，圖是自己畫的廣播塔 `banner-announcements.svg`；每一則左邊是種類圖示，下面一行是種類標籤與時間，停止服務排最前面（`importantFirst()`）、左邊一條紅線，內文用 `<details>` 收著，沒有內文就不能展開），沒有公告時整張不出現，出錯也只藏它自己（`QuietErrorBoundary`）。
- 跑馬燈（使用者要的：最重要的或要置頂的放在全站最上面，可以關掉，細長一條）：`AppShell` 在導覽列上面放 `announcement-ticker.tsx` 的 `AnnouncementTicker`（讀不到只藏它自己，`QuietErrorBoundary`），內容由 `rules.ts` 的 `inTicker()` 挑：停止服務與維護從開始前 3 天到結束（沒寫開始時間的當成已經開始），站長勾了「置頂到跑馬燈」（`core_announcements.pinned`）的到結束；照 `importantFirst()` 排，條的顏色看第一則（停止服務淡紅、維護淡黃、置頂的一般公告淡藍），每一則寫種類、標題與時間，點了到首頁的公告欄（`/#home-announcements`）。
  - `ticker-bar.tsx`（client）：放不下才捲（兩份清單接在一起走一半，一秒 60px、至少 12 秒一輪），滑鼠停在上面或焦點在裡面時暫停，減少動態時不捲、改成可以滑；右邊的 ✕ 把現在每一則的 key（`id:修改時間`，`ticker.ts` 的 `tickerItems()`）存進 localStorage（`allhub:announcements:ticker`），現在的每一則都關過才不出現（`isTickerDismissed()`），有新的或站長改過的就再出現。
  - 關掉後不閃：跟 YouTube 的劇院模式一樣用 `core/ui/html-flag.tsx`，整頁載入時同步腳本（`tickerScript()`，判斷跟 `isTickerDismissed()` 一樣，`ticker.test.ts` 實際跑一次比對）在 html 標上 `data-ticker-hidden`，CSS 藏起來。
- 讀 `cachedAnnouncements()`，標 `core:announcements`；要不要顯示在快取外面用現在的時間判斷（`isAnnouncementShown()`、`inTicker()`），不然過了結束時間還會留到快取過期。時間欄位是 `datetime-local`，一律當成台北時間。
