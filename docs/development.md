# 本機開發

這頁補充本機開發的細節：README〈快速開始〉指令的注意事項、假伺服器的特殊輸入、怎麼模擬 webhook，以及常用指令與測試。

## 本機環境

照 README 的 [快速開始](../README.md#快速開始本機試用) 建好 `.env.local`，再開三個終端機，分別跑 `db:local`、`mock:external` 與 `dev`。要注意的地方：

- **`DATABASE_POOL_MAX=1`**：PGlite 只有一條真正的連線，多條連線同時查詢偶爾會出錯。
- **`DEV_EXTERNAL_ORIGIN`**：只在開發模式有效。`npm run build && npm start` 會忽略它，請求會送到真的服務。
- **`PUBLIC_BASE_URL`**：要指向開發伺服器（預設 `http://localhost:3000`），假的 WebSub hub 才回呼得到。開發伺服器換 port 時要一起改。
- **假伺服器的設定**：下面兩個變數是假伺服器自己讀的，不讀 `.env.local`，要寫在指令前面，例如 `MOCK_AI_MS_PER_LINE=0 npm run mock:external`。
  - `MOCK_PORT`：改假伺服器的 port（預設 4010）。改了的話，`DEV_EXTERNAL_ORIGIN` 也要跟著改。
  - `MOCK_AI_MS_PER_LINE`：調整假 AI 的回應延遲。
- **重設本機資料**：資料存在 `.pglite/`（不進版控）。要重來就停掉 `db:local`、刪掉這個資料夾，再跑一次 `db:migrate` 與 `account create`。
- **播放器**：觀看頁的 YouTube 播放器是瀏覽器直接向 youtube.com 載入的，不經過假伺服器。

## 假伺服器的特殊輸入

| 服務 | 輸入 | 結果 |
|---|---|---|
| Twitch | 帳號 `nobody` | 查無此人；其他名稱都會成功 |
| Twitch | 長度相同的兩個帳號 | 假 id 是依帳號長度產生的（`alice` 是 `1035`），所以長度相同的第二個會被當成已經在追蹤 |
| HoYoLAB | 含 `ltoken_v2`、`ltuid_v2` 的 cookie | 連結成功；`ltoken_v2=expired` 會得到「HoYoLAB cookie 已失效…」 |
| YouTube | `@nobody` | 查無頻道；其他 `@帳號` 都會成功，hub 約 0.5 秒後回呼確認訂閱 |
| YouTube | 影片 id 開頭 `zhsubs`（例如 `zhsubs00001`） | 有人工上傳的中文字幕 |
| YouTube | 影片 id 開頭 `zhauto`（例如 `zhauto00001`） | 只有自動產生的中文字幕，算沒有中文 |
| YouTube | 影片 id 開頭 `nocaptions`（例如 `nocaptions1`） | 沒有任何字幕，可以試上傳字幕檔 |
| YouTube | 其他影片 id | 有 8 句韓文字幕 |
| AI | 任何 API Key | 內建的 8 句假字幕有固定譯文，其他句子回「〔中〕原文」。每批等 0.4 秒加每句 0.08 秒；`MOCK_AI_MS_PER_LINE=0` 不等 |
| AI | 含 `bad` 的 API Key | 翻譯時得到「… API Key 無效或沒有權限…」 |

影片 id 一定要剛好 11 碼（英數字、`_`、`-`），不然觀看頁會找不到影片。

## 模擬開台通知與新影片推送

先在網站上加好主播或頻道，再用 `.env.local` 裡的密鑰簽章後送出。頻道 id 可以在 YouTube 頁「追蹤中的頻道」裡，從頻道名稱的連結找到。

```bash
# Twitch 開台（alice 在假 Twitch 的 id 是 1035）
SECRET=<TWITCH_EVENTSUB_SECRET>
ID=$(uuidgen); TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BODY='{"subscription":{"id":"mock","type":"stream.online","status":"enabled"},"event":{"broadcaster_user_id":"1035","broadcaster_user_login":"alice","broadcaster_user_name":"ALICE","type":"live","started_at":"'$TS'"}}'
SIG=$(printf '%s' "$ID$TS$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/api/twitch/eventsub -H "Content-Type: application/json" \
  -H "Twitch-Eventsub-Message-Id: $ID" -H "Twitch-Eventsub-Message-Timestamp: $TS" \
  -H "Twitch-Eventsub-Message-Type: notification" -H "Twitch-Eventsub-Message-Signature: sha256=$SIG" -d "$BODY"

# YouTube 新影片
SECRET=<YOUTUBE_WEBSUB_SECRET>
CHANNEL=<頻道 id，UC 開頭>
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BODY='<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><entry><yt:videoId>zhsubs00001</yt:videoId><yt:channelId>'$CHANNEL'</yt:channelId><title>新影片</title><published>'$NOW'</published></entry></feed>'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/api/youtube/websub -H "Content-Type: application/atom+xml" -H "X-Hub-Signature: sha1=$SIG" -d "$BODY"
```

- **回應**：兩個端點都回 204。
  - YouTube 簽章不符時也回 204，只在伺服器 log 記一筆「忽略簽章不符的 WebSub 推送」。
  - 看不到通知時，先檢查伺服器 log。
- **Twitch 的限制**：時間戳要在 10 分鐘內。
- **YouTube 的限制**：`published` 要在 24 小時內；同一個影片 id 只算第一次，重送時要換一個 id。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發模式 |
| `npm run build` / `npm start` | 正式建置與啟動 |
| `npm test` / `npm run test:watch` | 單元與整合測試（不需要資料庫） |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型別檢查（要先 build） |
| `npm run db:generate` | 改了資料表後產生 migration |
| `npm run db:migrate` | 套用 migration（讀 `.env.local` 的 `DATABASE_URL`） |
| `npm run db:studio` | 瀏覽資料庫 |
| `npm run db:local` | 本機 PGlite 資料庫（port 5433） |
| `npm run mock:external` | 本機假外部服務（port 4010） |
| `npm run account …` | 帳號管理（見 [帳號管理](deploy.md#帳號管理)） |

## 測試

- **`npm test`**：跑 Vitest 單元與整合測試。
  - 整合測試用記憶體裡的 PGlite（`src/dev/test-db.ts`），不需要資料庫。
  - 測試不會對外部服務發請求：`src/dev/vitest-setup.ts` 把全域 `fetch` 換成只能連 localhost／127.0.0.1 的版本，其他目的地直接丟錯，錯誤訊息會說明怎麼換成替身（`fakeFetch` 傳給 `fetchImpl`、`vi.stubGlobal("fetch", …)`、`vi.mock(path, { spy: true })` 要設定回應）。
  - `docs/secrets.md` 產生亂數密鑰的那行指令，測試會實際執行，並用 `core/env.ts` 檢查每個值；改那行時測試也要通過。
  - 共用的測試輔助（環境變數、登入狀態、假 fetch、`next/cache` 的 spy…）都在 `src/dev/`，用法見 CLAUDE.md。
- **規則檢查**：`src/architecture.test.ts` 與 `src/cache-rules.test.ts` 檢查架構與快取規則（見 [架構](architecture.md)），包括 `process.env` 只出現在允許的地方。
- **CI 的順序**：`ci.yml` 依序跑 test → lint → build → typecheck。`typecheck` 要用 build 產生的 `.next/types`，所以本機也要先 build。
- **在瀏覽器裡測試**：一律用 `next dev` 加上 `npm run mock:external` 與 `DEV_EXTERNAL_ORIGIN`。
  - `next start` 會忽略 `DEV_EXTERNAL_ORIGIN`，只能用來測不會對外連線的流程：登入、首頁、記帳、通知頁、帳號頁。
  - 可見的分頁大約每 10 秒向 `/api/notifications` 輪詢一次（背景分頁每 60 秒），模擬開台或新影片後最多等 10 秒，提示卡片就會出現。
- **自動化測試觀看頁**：要先注入假的 `window.YT.Player`，否則瀏覽器會向 youtube.com 載入播放器。細節見 CLAUDE.md〈測試與 E2E〉。
