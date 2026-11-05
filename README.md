# AllHub Project

[![CI](https://github.com/GaeunHome/AllHub-Project/actions/workflows/ci.yml/badge.svg)](https://github.com/GaeunHome/AllHub-Project/actions/workflows/ci.yml)

AllHub 是個人製作、非商業的整合網站，把平常會用到的小工具放在同一個地方。

- **邀請制**：第一個帳號（站長）用命令列建立，其他人只能用站長發的邀請連結註冊。
- **資料分開**：每個人的資料各自分開，只有 YouTube 翻好的字幕與一起排的旅程共用。

## 畫面

截圖都是本機假資料（`npm run mock:external`），沒有真實帳號；觀看頁的播放器是測試用的假播放器。

![首頁儀表板：正在直播的主播、追蹤頻道的最新影片、星穹鐵道的即時便箋、所在縣市的天氣與帶傘提醒、理財的總資產與這個月要做的事、下一趟旅程、提醒與倒數、未讀通知](docs/images/home.jpg)

| 觀看頁（雙語字幕疊在影片上，深色模式） | 手機版：首頁、觀看頁、通知面板 |
|---|---|
| ![觀看頁：中文與韓文字幕疊在播放器上，下方是翻譯進度，右側是接下來播放](docs/images/watch.jpg) | ![手機版：首頁儀表板、雙語字幕的觀看頁、鈴鐺的通知面板](docs/images/mobile.jpg) |

## 功能

- **首頁**：最上面列出今天要注意的事，下面是天氣、提醒與倒數、正在直播、最新影片、星穹鐵道便箋、理財摘要與未讀通知；今天有行程時也會出現。
- **Twitch**：追蹤主播，開台時收到通知，點主播看放大的直播預覽。
- **YouTube**：追蹤頻道的新影片（不含 Shorts），用自己的 AI API Key（Claude、OpenAI 或 Gemini）邊播邊把韓文字幕翻成中文。
  - 翻好的字幕所有人共用、永久保留；別人翻到一半的，要自己按了才會用你的 Key 接著翻。
  - 想之後再看的影片可以保留，每人最多 15 部。
- **星穹鐵道**（非官方介面）：連結自己的 HoYoLAB 帳號。
  - 查看：即時便箋、活動日曆、角色與遺器、開拓月曆、終局戰績與躍遷紀錄。
  - 自動：每日簽到、兌換社群整理的新兌換碼。
  - 提醒：開拓力快滿，以及每日、每週與終局挑戰。
- **理財**：管理帳戶、收支、信用卡帳單、持股與每月固定收支，第一次用有「開始設定」清單帶著做。
  - 總覽有總資產、要先處理的事與「這個月要做的事」，常用動作直接放在帳戶和持股上。
  - 固定收支可以設間隔、遇假日提前或延後，到期按一下確認，也能設成自動記；薪水入帳後照設定分配到各帳戶。
  - 信用卡照銀行的帳單填，跟紀錄的差額自動補一筆。
  - 持股照證交所與櫃買中心的收盤價算市值，除權息前會通知。
- **旅遊**：跟同行的人一起排行程，用群組連結邀請，回程 7 天後自動刪除。
  - 把想去的點拖進每一天，時間照順序與停留時間自動算，改順序不用重排。
  - 貼 Google Maps 連結就帶入地點，也有留言與出發前清單。
  - 旅途中打開就看到下一站與導航，行程可以複製成文字貼到 LINE。
- **交通**：查高鐵、台鐵、捷運與公車的班次，存常用路線；追蹤的路線有路線圖與每 5 秒更新的倒數，開車前用即時資料校正。站長要先申請免費的 TDX 金鑰。
- **天氣**：卡片的背景圖跟著天氣與日夜換，顯示現在與下一個時段的天氣、降雨機率與空氣品質，天氣頁看台灣與國外城市的一週預報。站長要先申請免費的授權碼。
  - 會下雨時早上提醒帶傘，有特報或警報時也會通知，都可以關掉。
- **提醒與倒數**：寫下要記得的事與日期，可以選當天或提前幾天通知，日期過了自動刪除。
- **網站通知**：各模組的通知集中在鈴鐺，提示音與瀏覽器通知可以依模組分開開關。
- **帳號**：可以改暱稱、頭像、密碼與外觀（淺色、深色或跟隨系統），也可以刪除自己的帳號與資料。登入與註冊有圖形驗證碼，錯太多次會暫時鎖定。
- **管理（站長）**：建立邀請連結並決定開放哪些功能，停用或刪除帳號，勾選每個人能用的功能，查看操作紀錄（保留 7 天）與排程、外部服務的狀態。

使用聲明在 `/terms`。

## 技術

Next.js 16（App Router、Cache Components）、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM 與 PostgreSQL（正式環境用 Supabase，本機用 PGlite）、Vitest。部署在 Vercel Hobby，排程用 Vercel Cron。

## 快速開始（本機試用）

只需要 Node.js 24.2 以上，不需要任何雲端帳號：資料庫用 PGlite，外部服務都由假伺服器回應。Windows 請在 Git Bash 執行下面的指令（Git for Windows 內建 openssl）。

```bash
npm install

# 本機設定（.env.local 不會進版控）
cat > .env.local <<EOF
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
DATABASE_POOL_MAX=1
SESSION_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
TWITCH_CLIENT_ID=mock
TWITCH_CLIENT_SECRET=mock
TWITCH_EVENTSUB_SECRET=$(openssl rand -hex 32)
PUBLIC_BASE_URL=http://localhost:3000
YOUTUBE_WEBSUB_SECRET=$(openssl rand -hex 32)
TDX_CLIENT_ID=mock
TDX_CLIENT_SECRET=mock
CWA_API_KEY=mock
MOENV_API_KEY=mock
DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010
EOF

npm run db:local        # 終端機 1：本機資料庫（資料存在 .pglite/）
npm run mock:external   # 終端機 2：假的外部服務
npm run db:migrate      # 終端機 3：建資料表
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run account create
npm run dev             # 開 http://localhost:3000，用剛建立的帳號登入
```

`npm run account` 不讀 `.env.local`，所以本機的連線字串要寫在指令前面。沒寫的話，它會提示貼上連線字串（見 [帳號管理](docs/deploy.md#帳號管理)）。

想試各種狀況（查無頻道、cookie 失效、沒有字幕等）或模擬開台通知，見 [本機開發](docs/development.md)。

## 部署

網站、資料庫與排程都在雲端執行（Vercel Hobby、Supabase 免費方案，都在東京），部署之後電腦不用開著。正式環境的密鑰只放在 Vercel 的環境變數和 GitHub Secrets。

第一次部署的順序（除了建帳號，都在網頁上操作）：

1. 在 Supabase 建專案，取得兩個連線字串。
2. 在 Vercel 匯入這個 repo，填環境變數。
3. 在 GitHub Secrets 填 `MIGRATION_DATABASE_URL`、`CRON_SECRET`、`HUB_URL`，再到 Vercel 重新部署。
4. 執行 db-migrate workflow 建資料表。
5. 執行 `npm run account create`，依提示貼上連線字串，建好站長帳號後登入；其他人用「管理」頁的邀請連結註冊。

完整步驟與自己的網域見 [部署](docs/deploy.md)。

上線之後：

- **升級**：先看 [更新紀錄](CHANGELOG.md) 與 [之後的部署](docs/deploy.md#之後的部署)，只能從上一版升級。
- **回滾**：有些版本不能回滾，只能往前修；Deployment Protection 要保持開啟、Supabase 的 Data API 建議關閉，見 [回滾與部署保護](docs/deploy.md#回滾與部署保護)。
- **防護**：網站不讓搜尋引擎收錄；次數限制與被攻擊時的處理見 [防機器人與被攻擊時](docs/deploy.md#防機器人與被攻擊時)。

## 文件

| 文件 | 內容 |
|---|---|
| [部署](docs/deploy.md) | 部署到 Vercel 與 Supabase 的步驟、升級與回滾、部署保護、防機器人、邀請成員、帳號管理、換成自己的網域 |
| [密鑰管理](docs/secrets.md) | 每個密鑰是什麼、去哪裡拿、要貼到哪裡，以及更換的步驟與影響 |
| [模組設定與使用](docs/modules.md) | 每個模組與網站通知怎麼設定與使用 |
| [架構](docs/architecture.md) | 程式碼結構與新增、移除模組，排程、資料保留、快取、安全 |
| [本機開發](docs/development.md) | 本機環境的細節、假伺服器的特殊輸入、模擬 webhook、指令與測試 |
| [更新紀錄](CHANGELOG.md) | 每一版的新增、改善與修正，以及要套用的資料庫 migration |
| [規劃](docs/plans/) | 還沒做的功能規劃，做完就刪掉 |

## 第三方聲明

**圖示與圖片**

- 介面圖示：[Lucide](https://lucide.dev)（ISC）。
- YouTube、Twitch 標誌：[Simple Icons](https://simpleicons.org)（CC0 1.0）。
- 範例頭像與天氣圖：[Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)（MIT，授權全文在 `public/images/avatars/LICENSE.md`、`public/images/weather/LICENSE.md`）。
- 國旗：[circle-flags](https://github.com/HatScripts/circle-flags)（MIT，授權全文在 `public/images/flags/LICENSE.md`）。
- 理財頁的插圖：[unDraw](https://undraw.co)（unDraw License，可以商用與修改，見 [public/illustrations/LICENSE.md](public/illustrations/LICENSE.md)）。

**遊戲素材**（著作權屬於 HoYoverse（COGNOSPHERE），不在本專案的授權範圍內，詳見 [public/icons/LICENSE.md](public/icons/LICENSE.md)）

- 《崩壞：星穹鐵道》的標誌（`public/images/starrail-logo.png`）：只用來標示串接的服務，商標也屬於 HoYoverse。
- 元素、命途、屬性圖示（`public/icons/starrail/`）：來自社群整理的 [StarRailRes](https://github.com/Mar-7th/StarRailRes)（從遊戲解出的素材），只用在本專案的非商業用途。

**字型**：[Geist](https://vercel.com/font)、Geist Mono 與 [Rajdhani](https://fonts.google.com/specimen/Rajdhani)（星穹鐵道頁的數字），都是 SIL Open Font License 1.1。

**資料來源**

- 天氣預報：中央氣象署的氣象資料開放平臺。空氣品質：環境部的環境資料開放平臺。都依政府資料開放授權條款使用。
- 國外城市的一週預報：[Open-Meteo](https://open-meteo.com)（CC BY 4.0）。
- 交通：交通部的 [TDX](https://tdx.transportdata.tw) 運輸資料流通服務。
- 股價與除權息預告：臺灣證券交易所與證券櫃檯買賣中心的 OpenAPI。
- 假日：行政院人事行政總處的辦公日曆表（政府資料開放平臺）。
- 自動兌換的兌換碼清單：社群整理的 [hoyo-codes](https://github.com/seriaati/hoyo-codes)。

**商標**：YouTube、Twitch、HoYoLAB、《崩壞：星穹鐵道》、Claude、OpenAI、Gemini 是各自公司的商標，本專案與這些公司沒有關係。

**非官方做法**：HoYoLAB 的資料讀取、簽到與兌換，YouTube 的字幕讀取、頻道頭像與 Shorts 判斷都不是官方 API，可能失效或違反服務條款，請只用在自己的帳號（見 [模組設定與使用](docs/modules.md)）。

## 授權

尚未指定授權條款。本專案是個人製作、非商業用途的網站：不收費、不放廣告，也不拿來營利。專案裡的第三方素材只在非商業用途下使用，著作權屬於原權利人（見〈第三方聲明〉）。
