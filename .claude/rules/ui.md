---
paths:
  - "src/**/web/**"
  - "src/core/ui/**"
  - "src/core/**/*.tsx"
  - "src/app/**"
  - "public/**"
  - "**/*.css"
---

# 畫面與樣式

改畫面、元件、樣式與圖片時看這份；要改變風格或版面方向先問使用者。

- 彈出視窗（`core/ui/dialog.tsx`；原生 `<dialog>` 與 `showModal()` 只寫在這個檔案裡，`architecture.test.ts` 檢查）：
  - 用在哪裡：清單列裡的表單與詳情（修改紀錄、修改帳戶、主播詳情）不要展開在列裡；按鈕打開的表單（記一筆、薪水入帳並分配、更新餘額、填帳單、已繳、買進賣出、新增帳戶、新增帳號或更新 cookie）與建立後要先收好的內容（只在這一頁看得到的邀請連結）也用視窗。用 `DialogButton`；按鈕要自己排版時用 `useDialog()`＋`Dialog`。不在清單列裡、不常用的設定照舊收在 `<details>`（星穹鐵道的「帳號設定」）或按了才展開的區塊（觀看頁的「上傳字幕」），短的動作與狀態放 ⋮ 選單（YouTube 的頻道、理財各頁的修改、上移下移、停用、刪除；理財常用的動作直接放在列上，見 `src/modules/savings/CLAUDE.md`）；一個按鈕的動作照用 `ActionButton`，刪除類照用 `confirmMessage`。
  - 大小：`size` 的 sm／md／lg（24／32／44rem）給表單與短的詳情；內容多、要放大圖的詳情（星穹鐵道的角色詳情、Twitch 的主播詳情）用 `size="full"`：滿版的大面板，寬螢幕四周只留 1rem、手機全螢幕，高度固定，內容依面板大小自己排（角色詳情：使用者三次反映立繪太小，寬螢幕舞台佔面板大半（`web/starrail.css` 的 `.sr-stage`：`max(55cqw, 100cqw - 32rem)`，右欄最多 32rem），立繪預設放大到面板高度的 130–150%（`.sr-stage-art`，方形的圖裁掉左右的空白與腳邊，上面只裁一點，臉才看得到；手機是 135%），舞台左下角的「看全圖」切回完整不裁切（`web/components/character-stage.tsx`）；放大比例是照公開資料推的，真實立繪的留白還要用真實帳號確認；右欄文字比全站大一級，整個面板同一個捲動區，游標在立繪上也捲得動；主播詳情：預覽限高，16:9 的螢幕不用捲動）。開關、焦點、Esc、點背景、捲動鎖與 Activity 的處理跟其他大小一樣；其他視窗維持原本的大小。
  - 視窗裡的表單一律用 `useDialogForm()`：onSubmit 送出（`<form action>` 送完一定清空欄位，失敗時打的字會不見），失敗留在視窗裡、焦點回到 `data-autofocus` 的欄位；有下一步的表單（連結帳號先選伺服器）傳 `isDone` 判斷完成了沒。
  - 成功就關掉視窗，訊息用提示視窗（`done(message)`：先用 `flushSync` 關掉視窗再跳，報讀器不會在關閉中的視窗裡念）。打開視窗的按鈕或整列會不見時（刪除那一列、「開始使用」後卡片被換掉、確認或略過後那一列的按鈕不見、第一次選縣市後天氣卡片的空狀態被換掉），焦點移到最近還在的 `FOCUS_FRAME` 外框（`Dialog` 打開時記下按鈕外面的外框，`useDialogForm` 送出時記下表單外面的），不掉到 body，也不移到提示視窗。外框標在首頁卡片、`main`、管理頁的使用者卡片、理財的整頁與各清單、YouTube 的訂閱內容與已保留清單。
  - 關閉不另外跳確認（Chrome 連按 Esc 時擋不住），要保留的內容關掉後給「再看一次」（邀請連結；下一條建立失敗時上一條也留著，換到別頁時在 Activity 藏起來的清除函式裡忘掉，回來就沒了）。寬螢幕置中、手機從底部升起；標題列是 `CardHeader` 加關閉鈕，本文捲動；Esc、點背景、按 X 關閉；收起、卸載或 Activity 把頁面藏起來時一定關掉（開著的 modal 會讓整份文件不能操作）；內容只在開著時算繪。開著時背後的頁面不捲動，`html` 一律保留捲軸的位置，開關視窗時版面不會左右跳。
  - 報讀器：打開時要讓人知道的說明（邀請連結的建立結果與「只在這一頁看得到」）用 `Dialog` 的 `describedBy`（`aria-describedby`）指過去，說明用的 `FormMessage` 加 `live={false}`：內容跟視窗一起出現，放在 live region 裡來不及念，還會跟描述重複。live region 不巢狀（外層一變會連裡面的再念一次），也不放在按鈕裡（`CopyButton` 的字不變，結果念在旁邊一開始就在的 `status`）。
- 只有一個按鈕的表單（刪除、開關、排序）用 `core/ui/action-button.tsx`，刪除類帶 `confirmMessage` 先確認（底層是 `confirm-submit-button.tsx`）。
  - 回饋（使用者要的：「已新增 XX」這類訊息不留在頁面上，全站用提示視窗）：成功一律用 `useToast()` 的提示視窗；視窗裡與頁面上有欄位的表單，錯誤照舊放在欄位下面的 `FormFeedback`（使用者要對著欄位改）；視窗外的按鈕失敗（`ActionButton`、通知開關、模組權限的勾選框、同步訂閱、續訂）也用提示視窗。
  - 點了之後要一眼看到的結果（兌換碼、立即簽到、設定門檻、連結帳號）用提示視窗的標題寫結果、內容寫原因（預期外的錯誤在 `runAction()` 的 scope 加 `titled`，內容只寫「原因不明（詳見伺服器 log）」；沒有標題的照舊是「<動作>失敗（詳見伺服器 log）」），成功了但要提醒的用 `warning`。
  - 提示視窗在導覽列下方置中（最寬 26rem，手機左右 16px，不跟右下角的通知卡片疊），錯誤一組在上；同時最多 3 則，其他排隊，出現時才開始算：成功 4 秒、提醒與錯誤 8 秒，滑過或鍵盤焦點在上面時暫停，每則都有關閉鈕；兩個一直存在的 live region（錯誤 `alert`、其他 `status`），減少動態時不滑動。
  - 例外：觀看頁翻譯面板的錯誤（續翻暫停、沒有 API Key）是翻譯的狀態，留在面板裡；`CopyButton` 的「已複製」與星穹鐵道各區塊讀不到的錯誤也留在原地；建立後要先收好的邀請連結照舊在視窗裡。
  - 正式程式不能用原生 `alert()`（`architecture.test.ts` 檢查）。
  - 圖示用 `core/ui/icon.tsx`（名稱列在 `UI_ICON_NAMES`，檔案在 `public/icons/ui/`），卡片的標題列用 `CardHeader`、卡片外的區段標題用 `SectionTitle`，空狀態用 `EmptyState`。
- 外部圖片（頭像、縮圖、角色圖）由瀏覽器直接向平台的 CDN 載入，網站與資料庫都不存：用 `core/ui/external-image.tsx`（`next/image` 加 `unoptimized`，不經 Vercel 的圖片最佳化；`referrerPolicy="no-referrer"`；載入失敗或沒有網址時顯示 `fallback`），圓形頭像用 `core/ui/avatar.tsx`（退回名稱的第一個字）。
  - 網址一律先在伺服器端經 `core/external-url` 的 `externalAssetUrl()`：開發時有 `DEV_EXTERNAL_ORIGIN` 就改寫到假伺服器（E2E 不會連到真的 CDN），正式環境原樣輸出，不是 http(s) 的回 null。
  - 固定大小的圖給 `width`／`height`，填滿固定比例外框的用 `fill`（外框要是 relative）。
  - 畫面最上面一排的縮圖或預覽給 `loading="eager"`（常常是 LCP，延遲載入會慢一拍），其他照預設 lazy；`Scene` 的 `eager` 另外加 `fetchPriority="high"`（首頁天氣卡片與各頁橫幅的場景圖就是 LCP）。
  - 兩類圖片分開：平台資料的圖片（頭像、縮圖、角色圖）照上面由瀏覽器向 CDN 載入；遊戲的固定小圖示（星穹鐵道的元素、命途、屬性）是內建在 `public/icons/starrail/` 的靜態檔，用 `next/image`（`unoptimized`，跟官方標誌一樣）直接畫，不經 `externalAssetUrl()` 與 `ExternalImage`（見 `src/modules/starrail/CLAUDE.md`）；天氣圖與國旗也是（`public/images/weather/`、`public/images/flags/`，見 `src/modules/weather/CLAUDE.md`）。
  - `next/image` 一律加 `unoptimized`（`architecture.test.ts` 檢查）。
- 設計風格先問（使用者要的）：要改變畫面的風格或版面方向時（配色、字型、視覺語言、卡片與版面的排法、整頁改版、新頁面長什麼樣子），先把方向與選項拿給使用者看，確認後才動工，不要自己決定後做完再報告；Impeccable、ui-ux-pro-max 這類工具的建議也一樣，先給使用者看，不直接照改。只有跟著既有規則的小修正（對齊、間距、破版、對比、沿用現有元件）不用問。
- 畫面風格：全站簡潔中性（`globals.css` 的 token：白／淡灰底、灰色細框、陰影很輕），主色只有一個深藍，只用在主要按鈕、連結與焦點框；模組的品牌色（`data-accent`：`blue`／`red`／`violet`／`gold`／`green`，型別是 `core/module.ts` 的 `ModuleAccent`）只用在圖示與小標籤。
  - 場景圖（使用者要的：只有 icon 太陽春）：首頁、理財、管理、帳號與交通頁用自己畫的向量場景圖（天氣頁的大圖是真實照片，見 `src/modules/weather/CLAUDE.md`）（`public/images/scenes/`：天氣 8 張 `weather-<clear|cloudy|rain|storm>-<day|night>.svg`、橫幅 `banner-*.svg`、首頁入口 `module-*.svg`、交通查詢結果的標題 `transit-*.svg`）與交通的小圖（`public/images/transit/`），不是外部素材，也不放進資料庫。`public/images/` 在 `proxy.ts` 的 matcher 裡（要登入才讀得到），登入與註冊頁不能用。字疊在圖上時用 `Scene`（`core/ui/scene.tsx`）：字色用 `text-white` 這類寫死的白色，不換 `.scene` 的 CSS 變數，不然裡面打開的 `<dialog>` 也跟著變白；只有不含視窗的區塊才換變數（`.scene-facts`、`.card-art`）。`.scene-scrim` 左深右淺，右邊留給圖；圖上的小按鈕用 `.scene-button`。
  - 重要提示（使用者要的：不一定要用卡片）：要一眼看到、但不用馬上打斷的事用 `NoticeStrip`＋`NoticeItem`：貼著頁面的一條細線，一件接一件，手機上一件一行；裡面都沒有項目時 `:has()` 整條藏起來。
    - 首頁是「今天要注意」、理財總覽是「要先處理」、管理頁是鎖定的帳號。
    - 帶傘與特報留在天氣卡片的圖上（圖加白字，不用小標籤）；刪除帳號這類不能復原的動作用 `.danger-zone`（左邊一條紅線，平常收在 `<details>`）。
  - 主題頁：Twitch 頁用 `.theme-twitch`、星穹鐵道頁用 `.theme-starrail`（兩頁固定深色），YouTube 頁用 `.theme-youtube`（照 YouTube 網站的淺色與深色，跟著外觀切換，紅色只用在標誌與進度條）：只換 CSS 變數，共用的 class（`card`、`chip`、按鈕、`input`…）自動跟著換色，不要另外複製一套元件。
    - 三頁都是整頁主題：整頁底色鋪滿全寬與整個高度（`:root:has(.theme-…:not([data-activity-hidden]))`），內容直接放在 AppShell 的外框裡（不再包一張圓角大卡片）。
    - YouTube 連導覽列也換（`:root` 換 `--bg-base` 與 `--header-bg`）；Twitch 與星穹鐵道的導覽列、鈴鐺面板、人像選單維持全站的樣子（使用者的決定）：調色盤（含 `color-scheme: dark` 與深色模式的 `--accent-*`、`--*-dot`）只放在 `PageTheme` 的外框上，`:root`／`html`／`body` 只換背景（與星空的變數 `--sr-sky`），這兩頁的導覽列改成不透明（全站的 `--header-bg` 疊在 `--bg-base` 上；半透明疊在深色底上會變灰，`page-theme.test.ts` 檢查）。
    - 星穹鐵道的星空畫在 `body`（最上層是自己畫的靜態 `public/images/starrail-sky.svg`，不加動畫：背景圖一動整頁都要重畫；html 另外給底色，背景才跟著長頁面拉長），彈出視窗用 `sr-dialog` 自己畫星空底。
    - 外框一律用 `core/ui/page-theme.tsx` 的 `PageTheme`：Activity 藏起來的頁面還留在文件裡，`:root:has()` 會比對到它，`PageTheme` 在藏起來時（layout effect 的清除函式）標上 `data-activity-hidden`，換頁時主題不會漏過去；伺服器算繪的 HTML 沒有標記，整頁載入時第一次繪製就是這一頁的底色。
    - 主題 class 只能放在 `PageTheme` 上（視窗、卡片也不行，`architecture.test.ts` 檢查）。
- 樣式檔：全站共用的 token、base、主題頁的引入與觸控放大這類跨元件的規則在 `src/app/globals.css`；core 的元件樣式在 `src/core/ui/styles/*.css`（圖示、版面、公告、按鈕與輸入框、標籤、提示、場景圖、區塊、導覽列、彈出層、視窗，每個檔開頭寫著裝了什麼），`globals.css` 在 `@layer components` 開頭照原本寫在那裡的順序引入，順序不能換；模組專用的放在模組的 `web/`（交通照區塊分成 `transit.css` 與 `transit-*.css` 九個檔，照順序接著引入），`globals.css` 用 `@import` 照原本的位置引入（Tailwind 編譯時換成檔案內容，結果跟寫在同一個檔案一樣，所以檔案裡不包 `@layer`、不寫 `@reference`，也不從 TS import）：主題頁的調色盤 `theme.css` 與整頁底色 `page-background.css` 在 `@layer` 外面，元件的 `savings.css`、`youtube.css`、`twitch.css`、`starrail.css`、`transit*.css`、`weather.css`、`player.css`（YouTube 的播放器）在 `@layer components` 裡、觸控放大的規則前面。
  - 模組的檔只寫自己前綴的 class（`architecture.test.ts` 的 `MODULE_CSS_PREFIXES`：理財 `fin-`、星穹鐵道 `sr-`、Twitch `tw-`、YouTube `yt-`／`player-`／`subtitle-`、交通 `trn-`、天氣 `wx-`；`@keyframes` 不算 class，寫在 `globals.css`）與自己的 `.theme-<id>`，core 的 class 只能接在它們的選擇器裡（例如 `.theme-youtube .switch`），`@theme` 的變數也帶自己的前綴（例如星穹鐵道的金色；變數名稱不要寫進 md 或 TS，Tailwind 掃到會把它輸出到 `:root`）；`globals.css` 與 `core/ui/styles` 裡的模組 class 只剩跟 core 或兩個模組寫在同一條規則裡的（`SHARED_IN_GLOBALS`：固定深色頁的圖示色與不透明導覽列、減少動態裡 Twitch 的浮起、觸控放大的 `yt-pill-sm`／`yt-chip`／`sr-tab`），另外 `:root` 還有理財的 `--fin-income`／`--fin-expense`。
  - 搬樣式時比對前後編譯出來的 CSS 要完全相同。
- 間距與對齊（主題頁也照這套，只換配色）：
  - 距離交給父層的 gap，子元素不加零散的 margin（例外：`details` 的展開內容、絕對定位、對齊用的負邊距）。頁面的區塊之間 `page-stack`（gap-8）；卡片與區段裡、表單的欄位之間 `stack`（gap-4）；欄位是 `field`＋`field-label`（標籤與輸入框 gap-1.5）；一排按鈕 `button-row`（gap-2）。
  - 卡片內距一律 `card`（p-5／sm:p-6）；卡片裡撐滿左右的清單用 `card-list`＋`card-row`（列的左右內距跟卡片一樣，文字對齊卡片內容），只有清單的卡片是 `card p-0`＋`card-row`；卡片裡再小一級的區塊用 `panel`（p-4）。標題放在卡片裡用 `CardHeader`，頁首、區段標題、卡片對齊同一條左邊線；主要頁面都在 AppShell 的外框裡（`app-header.tsx` 的 `SHELL_FRAME`：幾乎滿版的 `max-w-[120rem]`＋`px-4 sm:px-6 lg:px-8`，導覽列與內容共用、左右邊線對齊，超寬螢幕才置中；`app-shell.test.ts` 檢查），登入與註冊共用 `AuthCard`（max-w-md；背景是三團慢慢飄的柔光 `.auth-glow`，使用者選的，只動 transform，減少動態時停住）。
  - 寬螢幕：清單與格線在 xl／2xl 加欄（YouTube 的影片 2→3→4 欄）；表單類的頁面（理財的設定、通知、帳號、管理、翻譯設定）在 xl 改成兩欄或三欄，Twitch 頁的輸入框限寬 `max-w-2xl`，不把輸入框拉到整個畫面寬；Twitch 頁在 2xl 把開台紀錄移到右邊一欄，直播卡片用 auto-fit（人少時撐滿這一欄，不空下一兩欄），首頁「正在直播」只有一兩位時改成橫的卡片；觀看頁的播放器寬度依視窗高度封頂（照 YouTube，播放器大小優先，一行標題與頻道列留在畫面裡），多的寬度給「接下來播放」；劇院模式時播放器撐滿兩欄；理財總覽（`dashboard/layout.ts`）總資產在橫幅裡，「我要…」一排六個，下面在 xl 分兩欄（左邊這個月要做的事、右邊本月收支與每月收支），2xl 拆成三欄；帳戶、投資、每月固定與設定的卡片用同一個 `CARD_GRID` 照寬度加欄，紀錄頁在 xl 旁邊固定放這個月的合計。
    - 排欄（`col-span`、`row-span`）寫在元素自己身上，或把同一欄的卡片包成一個 `page-stack`，不從外框用 `[&>:first-child]`、`[&>:nth-child()]`、`*:first:` 挑第幾個（永遠排第一個的 `PageHeader` 例外；`architecture.test.ts` 檢查）：Server Action 的表單開頭有 React 加的隱藏 input，串流中的 Suspense 也會在原地多一個 `<template>`，第幾個會算錯。
    - 同一個元件在不同地方寬度不同的（首頁卡片外框、理財的這個月要做的事、快捷按鈕、信用卡卡面與帳單紀錄、星穹鐵道角色詳情的右欄）用 `@container`，裡面用容器查詢（例如 `@sm:`、`@md:`、`@3xl:`）依所在的寬度排欄，不用螢幕寬度；Twitch 的直播卡片改用 auto-fit 的格線（見上面）。
  - 高度：按鈕、輸入框、下拉選單、分段選擇、YouTube 的膠囊按鈕（`yt-pill`）與搜尋列都是 44px；下拉選單（`select.input`，`appearance: none`，箭頭是 CSS 畫的，離右邊框跟文字離左邊框一樣遠，使用者覺得原生的太貼右邊）同樣 44px；清單列與工具列裡的次要按鈕（`btn-sm`）、導覽膠囊、YouTube 的篩選膠囊（`yt-chip`）與 `yt-pill-sm`、⋮ 是 36px，觸控裝置一律放大到 44px（`globals.css` 最後的 `pointer: coarse`），太小的元素用透明的偽元素把點擊範圍撐到 44px；只有圖示的按鈕是正方形（`btn-icon`、`icon-button`）；chip 一律 22px。
  - 同一列的卡片用 grid 等寬等高、清單的列一樣高；頭像只用 `Avatar` 的四種大小；圖示與文字垂直置中；金額與數字靠右加 `tabular-nums`，同一欄用固定欄寬對齊。
  - 手機：單欄、左右內距 16px（彈出面板也一樣）、不能橫向捲動（刻意橫捲的導覽列模組按鈕、頭像列、篩選膠囊列、觀看頁的膠囊列除外；導覽列的按鈕不換行，放不下時目前的模組自動捲進畫面，窄螢幕右緣淡出提示還能滑，見 `core/ui/styles/basics.css` 的 `.nav-scroll`；這些橫向列在電腦上用滑鼠拖，見 `drag-scroll.ts`）。
- 外觀（淺色／深色／跟隨系統）在導覽列的人像選單切換：`createLocalPref`（key `allhub:theme`）存在瀏覽器、跨分頁同步，寫在 `<html data-theme>`（跟隨系統時拿掉）。根 layout `<head>` 的同步腳本（`THEME_INIT_SCRIPT`）在第一次繪製前套用，深色不會先閃一下淺色；`ThemeSync` 補回開發模式 StrictMode 清掉的屬性。深色的樣式一律用 `@variant dark`／`dark:`（`globals.css` 的 `@custom-variant dark`：有 `data-theme` 時以它為準，沒有時跟隨系統），不要直接寫 `prefers-color-scheme`（`theme.test.ts` 檢查）。
- 不用灰色的說明字（使用者要的，全站都是）：使用者需要的狀態用標籤（`StatusChip`、`chip`）或圖示加正常大小的深色文字；說明文字收進標題或欄位標籤旁的 `InfoTip`（i 圓圈，使用者要的，例如新密碼的規則、資料來源、開始設定每一步的說明、理財帳戶的結帳日與起始餘額、提醒的日期；只寫濃縮的一句，40 字以內，不用「。」「；」，`src/__tests__/info-tip-text.test.ts` 檢查；理財表單的 `AmountField`、`DayOfMonthSelect` 用 `tip`）；跟著輸入變的試算（差額、估的股數、預計金額）與輸入時要看的規則（信用卡填負數）照舊寫在欄位下面，但用深色（`text-ink`）；空狀態的說明、`notice`、`<details>` 打開的內容、視窗與選單裡的說明都是深色；很長的內容才用 `<details>`（`disclosure`）或移到 docs；時間、數量、頻道名稱這類資料保留但要夠深（`text-ink-soft`），不用 `text-muted`（只留給輸入框裡的圖示與裝飾的箭頭）。錯誤與提醒照上面回饋的分工（提示視窗與表單的 `FormFeedback`）。
- 不用「·」把好幾件事串成一行（使用者覺得醜，全站都是，`src/__tests__/middle-dot.test.ts` 擋正式程式出現 `·`，測試與 `dev/` 的假資料不算）：標籤加值用 `FactList`，或分成上下兩行、左右兩欄、各自一個 `span` 用 gap 隔開、各自一個標籤，看哪種一眼看懂；不加顏色、圖示或動畫。
- 讀不到外部資料時一律寫「暫時無法讀取」（使用者要的，全站一樣）：需要時前面加主詞（「時刻表暫時無法讀取」「臺北捷運、環狀線暫時無法讀取」），後面不加「稍後再試」；按了按鈕才失敗的錯誤（新增持股、加常用路線）照舊接「請稍後再試」；問題出在使用者自己的 cookie 這類不會自己好的，寫「無法讀取」不加暫時。log、排程的摘要與系統狀態頁的問題不在此限。
- 停用的按鈕全站一個樣子（使用者要的）：`core/ui/styles/controls.css` 的一條規則（`button`、`btn-*`、`icon-button`、`switch` 的 `:disabled` 與 `[aria-disabled="true"]`：變淡到 0.55、游標是不能按），停用時滑過也不換底色；模組不另外寫停用的樣子（`src/core/ui/__tests__/disabled-look.test.ts` 檢查只有一條）；送出中的 `ActionButton` 與通知開關照樣變淡，只是游標換成等待（`BUSY_CLASS`）。
- 滑過的底色跟著字色（使用者回報過白底白字）：`icon-button`、`btn-ghost`、`card-header-link` 滑過與打開時的底色是字色混透明（`color-mix(in srgb, currentColor 7%, transparent)`），一般地方是淡灰，場景圖的標題列、台鐵與公車卡片這類白字的地方是淡白；不要寫死 `--surface-muted` 這類淺色（`src/core/ui/__tests__/hover-look.test.ts` 檢查）。

## core/ui 的共用元件

都在 `src/core/ui/`，寫畫面前先看有沒有現成的，不在模組裡另做一份。

- `home-page.tsx`＋`home-card.tsx`（首頁的排版與卡片外框；`HomeSlot` 的 `shown` 給平常不出現的卡片，回 false 時跟被關掉一樣，不算格子也不留外框，判斷時出錯只藏那一張；`HomeCard` 的 `variant` 是 `card`、`plain`（沒有外框，直接放在頁面上）或 `bare`（標題列也由內容自己畫），`art` 是標題列的背景圖）
- `card-error-boundary.tsx`（`next/error` 的 `catchError`，畫面只說讀不到、可以重試，不顯示錯誤內容；`QuietErrorBoundary` 出錯時什麼都不畫，給提示列的項目用）
- `scene.tsx`（`Scene`、`SceneImage`：字疊在場景圖上的區塊，見上面的畫面風格）
- `page-banner.tsx`（`PageBanner`：有場景圖的頁首，理財、管理、帳號共用，`children` 放標題下面的內容）
- `notice-strip.tsx`（`NoticeStrip`＋`NoticeItem`：重要提示，見上面的畫面風格）
- `user-avatar.tsx`（`UserAvatar`：站內帳號的頭像，選了範例頭像就畫圖，沒選或認不得時是文字頭像，顏色由帳號名稱決定，暱稱改了也不變）
- `drag-scroll.ts`＋`drag-scroll-root.tsx`（`DRAG_SCROLL`：橫向列加上這個標記，放不下時滑鼠按住就能拖，使用者要的；整站一組監聽掛在 `AppShell`，手指本來就能滑所以只管滑鼠，超過 6px 才算拖曳（`DRAG_PX`，交通選站的路線圖也用），拖過放開時擋掉那一次 click；旅遊看板不加，它有自己的拖曳）
- `skeleton.tsx`（`Skeleton`：載入中的骨架；`LoadingState`：外層補上 status 與隱藏文字，報讀器才知道正在載入）
- `back-link.tsx`（`BackLink`：回上一層的連結）
- `empty-state.tsx`（`compact` 是卡片裡的橫向小版，可以帶 `action` 按鈕）
- `external-image.tsx`（外部圖片）
- `avatar.tsx`（圓形頭像，只有 xs／sm／md／lg 四種大小，退回文字頭像）
- `page-header.tsx`（`PageHeader` 頁首、`CardHeader` 卡片的標題列、`SectionTitle` 卡片外的區段標題）
- `status-chip.tsx`（狀態標籤）
- `form-message.tsx`（`FormState`、`FormMessage`、`FormFeedback`：只放表單的錯誤，分工見上面的回饋）
- `toast.tsx`＋`toast-queue.ts`＋`toast-layer.ts`（提示視窗：`ToastProvider` 在 AppShell 最外層，`useToast()` 的 `success`／`warning`／`error`／`result(state, fallback)`；佇列、計時與上限在 `toast-queue.ts`，Server Action 的結果跳提示一律包 `withToast(toast, action, { fallback, errors })`（`errors: false` 時錯誤留給表單），搬進最上面開著的 `<dialog>` 再 `showPopover()` 排到 top layer 在 `toast-layer.ts`）
- `outside-press.ts`（`useOutsidePress()`：鈴鐺面板、人像選單、⋮ 選單、i 說明框共用的點外面收起，Esc 各自處理）
- `popup-position.ts`（`placeNear()`：⋮ 選單與 i 說明框共用的貼著按鈕、夾在畫面內、下方放不下才放上方）
- `top-layer.ts`（`showOnTop()`、`hideFromTop()`：彈出層用 popover 放進 top layer，⋮ 選單、i 說明框與提示視窗共用。外層是一層（`isolation`、`filter`）或用了容器查詢（`container-type`）時，fixed 定位會被關在外層裡，被切掉或被後面的卡片蓋住（交通常用路線的 ⋮ 與一些 i 圓圈發生過，`more-menu.test.ts`、`info-tip.test.ts` 檢查）；瀏覽器預設的 popover 樣式（置中、邊框、內距）在 `globals.css` 蓋掉）
- `focus-frame.ts`（`FOCUS_FRAME`：`data-focus-frame`＋`tabIndex={-1}` 的外框；`keepFocusInFrame()` 掛在打開視窗的按鈕、`ActionButton` 的表單與 ⋮ 選單上，那一列或按鈕不見、焦點掉到 body 時移到最近還在的外框，最外面是 `main`）
- `action-button.tsx`（只有一個按鈕的表單；成功與失敗都跳提示視窗，伺服器沒給訊息時用 `successMessage`；送出中是 `aria-disabled`、焦點留在按鈕上，再按不重送也不再確認）
- `notify-toggle.tsx`＋`notify-toggle-form.ts`（通知開關與它的欄位解析；`variant="menu"` 時那一列的文字由模組用 `label` 給）
- `count-badge.tsx`（`CountBadge`：未讀數，超過 99 寫 99+）
- `media-grid.tsx`（`MEDIA_GRID`、`MediaGridSkeleton`：首頁影音卡片的格線與骨架）
- `fact-list.tsx`（`FactList`＋`Fact`：標籤＋值的列，`layout` 是 `wrap`（值放不下時在右邊換行）或 `line`（一列到底））
- `segmented-control.tsx`（`SegmentedControl`；`variant="field"` 給表單用：撐滿寬度、標籤只給報讀器，`name` 會把選到的值一起送出）
- `local-pref.ts`（`createLocalPref()`，存在瀏覽器的偏好，跨分頁同步）
- `client-value.ts`（`useClientValue(read, serverValue)`：只有瀏覽器讀得到的值，伺服器與 hydration 時用 `serverValue`，兩邊不會不一致；`useHydrated()`：hydration 完成後才是 true。不要再自己寫 `useSyncExternalStore` 配空的 subscribe）
- `html-flag.tsx`（存在瀏覽器的偏好標在 html 的屬性上，樣式依它排版：`htmlFlagScript()` 是整頁載入時第一次繪製前跑的同步腳本、`setHtmlFlag()` 標上或拿掉、`useHtmlFlagSync()` 只在伺服器算繪與 hydration 時放腳本，站內換頁時由 layout effect 在繪製前標好，Activity 藏起來或卸載時拿掉；YouTube 的劇院模式與交通的側邊欄共用）
- `header-menus.tsx`（導覽列右上角的鈴鐺面板與人像選單，同時只開一個：`useHeaderMenuRoot()` 只給包住按鈕與面板的外框用、每個面板一個，掛點外面與 Esc 收起的監聽；面板裡的項目要收起面板（選單裡的連結）用不掛監聽的 `useHeaderMenu()`。項目用了外框的版本時 ref 沒接上，按哪裡都算外面，按下的瞬間選單就收起、項目全都點不到（v0.1.1～v0.1.2 的人像選單），`header-menus.test.ts` 檢查）
- `delete-menu-item.tsx`（`DeleteMenuItem`：⋮ 選單裡先確認的刪除項目，所有模組共用，新的不要自己用 `ActionButton` 組；`fields` 是跟著送出的欄位，`deletedMessage` 是提示視窗的備援，沒給時那一列不見就是結果）
- `form-buttons.tsx`（`FormButtons`：視窗表單最下面的取消與送出，所有模組共用，預設寫「儲存」）
- `more-menu.tsx`（⋮ 選單：寬螢幕貼著按鈕、手機從底部升起；選單與遮罩放在 top layer（`top-layer.ts`），會橫向捲動的列與卡片都裁不掉也蓋不住；Activity 把頁面藏起來時收起。打開視窗的項目帶 `aria-haspopup="dialog"`（`useDialog()` 的 `triggerProps` 已經有）、按了就做完的項目帶 `data-closes-menu`（例如複製），點了選單就收起、焦點先回到 ⋮，視窗要放在選單外面才不會跟著卸載；Esc 只收起選單，不連外層的視窗一起關）
- `theme.ts`＋`theme-sync.tsx`（外觀：淺色／深色／跟隨系統）
- `copy-button.tsx`（複製到剪貼簿：按鈕的字不變，結果在旁邊的 `status`，外層用 `button-row`）
- `password-input.tsx`（密碼欄位，眼睛按鈕切換明碼與隱碼）
- `info-tip.tsx`（`InfoTip`：標題旁的 i 圓圈，滑過時反色（使用者要的，`--ink` 底配 `--surface` 字，深色的地方是白底圓圈；場景圖上字色變數是白的，反色會白底白字，所以 `.scene` 寫死白底深字），滑過或用鍵盤移到時顯示說明，點一下固定顯示、觸控裝置靠這個切換，Esc 或點外面收起；說明用 `aria-describedby` 接在按鈕上，按鈕照 `popup-layer.ts` 宣告成彈出層；說明框放在 top layer（`top-layer.ts`）、左右夾在畫面內留 16px，不會被裁掉、蓋住，也不撐出橫向捲動）
- `dialog.tsx`（彈出視窗：`Dialog`、`DialogButton`、`useDialog()`、`useDialogForm()`，用法見上面的彈出視窗）
- `page-theme.tsx`（`PageTheme`：會換整頁底色的主題頁外框，Activity 藏起來時標記，見上面的畫面風格）
- `popup-layer.ts`（`popupLayerOpen()`：有沒有彈出層開著，認開著的 `<dialog>` 與宣告了彈出層而且 `aria-expanded="true"` 的觸發按鈕（`aria-haspopup`，面板不是 menu／dialog 這類角色時標 `POPUP_TRIGGER`（`data-popup-trigger`），例如 ⋮ 選單），Activity 藏起來的不算；`listenPageKeys()`：頁面自己的快捷鍵，按下的當下有彈出層就不處理，Esc 只關掉彈出層。新的彈出層照這樣宣告）
- `live-clock.tsx`（`useClockStep(stepMs)`：每隔一段時間更新一次的現在時間，對齊到這段時間的倍數，伺服器與第一次算繪是 null；`useCurrentMinute()` 是每分鐘的版本；`LiveClock`：導覽列鈴鐺左邊的台北時間 HH:mm:ss，每秒更新；所有時鐘共用一個對準整秒的 setTimeout，沒有人用或被 Activity 藏起來時停，回到前景立刻對時；伺服器只放看不見的佔位，不會 hydration 不一致；`<time>`，不是 live region）
