# AllHub Project

[![CI](https://github.com/GaeunHome/AllHub-Project/actions/workflows/ci.yml/badge.svg)](https://github.com/GaeunHome/AllHub-Project/actions/workflows/ci.yml)

AllHub 是個人用的整合網站，把平常會用到的幾個小工具放在同一個地方：Twitch 開台通知、YouTube 新影片與韓文字幕即時翻譯、星穹鐵道的便箋與簽到、存錢記帳。這是給一個人自己用的網站：帳號只能在自己電腦上用命令列建立，網站沒有註冊頁。

## 畫面

截圖都是本機假資料（`npm run mock:external`），沒有真實帳號；觀看頁的播放器是測試用的假播放器。

| 首頁 | 觀看頁（雙語字幕疊在影片上，深色模式） |
|---|---|
| ![首頁：四個模組與導覽列的未讀數](docs/images/home.jpg) | ![觀看頁：中文與韓文字幕疊在播放器上](docs/images/watch.jpg) |

![手機版：首頁、觀看頁、通知面板](docs/images/mobile.jpg)

## 功能

- **Twitch**：追蹤主播，開台時收到通知，內容有直播標題與分類。
- **YouTube**：追蹤頻道的新影片，並判斷有沒有中文字幕。沒有中文字幕的影片可以在網站裡邊播邊翻，用 AI（Claude、OpenAI 或 Gemini）把韓文字幕翻成中文。
- **星穹鐵道**：連結自己的 HoYoLAB 帳號，提供即時便箋、每日自動簽到與開拓力快滿提醒。用的是非官方介面。
- **存錢記帳**：記下每個月固定要存的錢，看這個月存了沒、今年與全部的累計，以及最近 12 個月的長條圖。
- **網站通知**：各模組的通知集中在導覽列的鈴鐺。提示音與瀏覽器通知可以依模組分開開關。
- **帳號登入**：用帳號和密碼登入，可以在帳號選單改密碼或登出。

## 技術

Next.js 16（App Router、Cache Components）、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM 與 PostgreSQL（正式環境用 Supabase，本機用 PGlite）、Vitest。部署在 Vercel Hobby，排程用 Vercel Cron 與 GitHub Actions。

## 快速開始（本機試用）

只需要 Node.js 24.2 以上，不需要任何雲端帳號：資料庫用 PGlite，Twitch、YouTube、HoYoLAB、AI 都由假伺服器回應。Windows 請在 Git Bash 執行下面的指令（Git for Windows 內建 openssl）。

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
DEV_EXTERNAL_ORIGIN=http://127.0.0.1:4010
EOF

npm run db:local        # 終端機 1：本機資料庫（資料存在 .pglite/）
npm run mock:external   # 終端機 2：假的 Twitch／YouTube／HoYoLAB／AI
npm run db:migrate      # 終端機 3：建資料表
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run account create
npm run dev             # 開 http://localhost:3000，用剛建立的帳號登入
```

`npm run account` 不讀 `.env.local`，所以本機的連線字串要寫在指令前面。沒寫的話，它會提示貼上連線字串（見 [帳號管理](docs/deploy.md#帳號管理)）。

想試各種狀況（查無頻道、cookie 失效、沒有字幕等）或模擬開台通知，見 [本機開發](docs/development.md)。

## 部署

- 網站、資料庫、排程都在雲端執行：Vercel（Hobby）、Supabase（免費方案），都在東京；排程用 Vercel Cron 加 GitHub Actions。部署之後電腦不用開著。
- 正式環境的密鑰只放在 Vercel 的環境變數和 GitHub Secrets，電腦上不保存。
- 第一次部署的順序（除了建帳號，都在網頁上操作）：
  1. 在 Supabase 建專案，取得兩個連線字串。
  2. 在 Vercel 匯入這個 repo，填環境變數。
  3. 在 GitHub Secrets 填 `MIGRATION_DATABASE_URL`、`CRON_SECRET`、`HUB_URL`，再到 Vercel 重新部署。
  4. 執行 db-migrate workflow 建資料表。
  5. 執行 `npm run account create`，依提示貼上連線字串，建好帳號後登入。
- 完整步驟，以及換成自己網域的做法，見 [部署](docs/deploy.md)。
- 網站不讓搜尋引擎收錄；登入次數限制、被攻擊時的處理與兩步驟驗證見 [防機器人與被攻擊時](docs/deploy.md#防機器人與被攻擊時)。

## 文件

| 文件 | 內容 |
|---|---|
| [部署](docs/deploy.md) | 部署到 Vercel 與 Supabase 的步驟、防機器人、帳號管理、換成自己的網域 |
| [密鑰管理](docs/secrets.md) | 每個密鑰是什麼、去哪裡拿、要貼到哪裡，以及更換的步驟與影響 |
| [模組設定與使用](docs/modules.md) | Twitch、YouTube、星穹鐵道、存錢記帳、網站通知怎麼設定與使用 |
| [架構](docs/architecture.md) | 程式碼結構與新增模組、排程、資料保留、快取、安全 |
| [本機開發](docs/development.md) | 本機環境的細節、假伺服器的特殊輸入、模擬 webhook、指令與測試 |

## 第三方聲明

- **圖示與字型**：介面圖示來自 [Lucide](https://lucide.dev)（ISC），YouTube、Twitch 標誌來自 [Simple Icons](https://simpleicons.org)（CC0 1.0），詳見 [public/icons/LICENSE.md](public/icons/LICENSE.md)。字型是 [Geist](https://vercel.com/font) 與 Geist Mono（SIL Open Font License 1.1）。
- **商標**：YouTube、Twitch、HoYoLAB、《崩壞：星穹鐵道》、Claude、OpenAI、Gemini 是各自公司的商標，本專案與這些公司沒有關係。
- **非官方做法**：HoYoLAB 的資料讀取與簽到、YouTube 的字幕讀取都不是官方 API，可能失效或違反服務條款，請只用在自己的帳號（見 [模組設定與使用](docs/modules.md)）。

## 授權

尚未指定。
