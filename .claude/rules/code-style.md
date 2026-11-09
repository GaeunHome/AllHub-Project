---
paths:
  - "src/**"
---

# 寫法

- 檔名與資料夾 kebab-case，元件與型別 PascalCase，函式與變數 camelCase，常數 UPPER_SNAKE_CASE。
- 註解只寫為什麼：白話、簡短、最多兩行；不用標點符號，片語之間用空格隔開，只留檔名、識別字、數字與單位本身的符號（例如 `// 伺服器是 UTC 月底晚上八點後會差一個月 所以本月用台北時間算`）；不重述程式碼。`eslint-disable`、`@ts-expect-error` 這類指令照原樣。測試名稱與介面文字不算註解。行數與全形標點由 `src/__tests__/comment-style.test.ts` 檢查。
- 介面文字、註解、測試名稱用繁體中文。
- 測試只寫答案來自程式以外的：需求（使用者說的，或 CLAUDE.md、docs 寫明的行為）、從輸入手算得出的值、發生過的 bug、架構與快取規則、資料庫與安全（擁有權與 IDOR、交易、migration、登入與權限）。照著程式抄答案的不寫：常數、文案、Tailwind class、內部函式的呼叫次數與順序、先跑程式再貼上的輸出、等於預設值的 props（v0.1.5 依這個標準刪掉了約 225 個測試）。這類行為要改時先寫出會失敗的測試，確認失敗再實作；不為了讓測試通過而刪除或放寬既有測試。
- 不裝新套件、不改資料表結構，除非使用者要求。
- 對外請求一律經 `core/external-url` 的 `externalFetch()`（開發時改送假伺服器、預設 15 秒逾時，AI 翻譯用 `AI_TIMEOUT_MS`），新增外部呼叫也要用它，讀 JSON 用 `readExternalJson()`；正式程式不直接呼叫全域 `fetch()`，例外只有 `core/external-url.ts` 本身與 client 元件呼叫自家的 `/api/`（`architecture.test.ts` 檢查）。
- Server Action：先 `requireSession()`（模組的用 `requireModule("<模組 id>")`，id 要跟資料夾一樣；管理用的先 `requireOwner()`），拿到的使用者 id 傳給 service（見 `.claude/rules/multi-user.md`）；`"use server"` 檔的每個 export 第一個敘述就是 `await requireSession()`、`await requireModule(…)` 或 `await requireOwner()`，不用登入的只有 `login`、`registerAction`、`logout`，Server Action 一律寫在開頭有 `"use server"` 的檔案、不寫在函式裡（`architecture.test.ts` 檢查）。欄位用 `core/form.ts` 的 `formText`／`formId`／`formFlag` 讀，寫入包在 `runAction()` 裡（錯誤變成表單訊息、log 只記種類，不會跳錯誤畫面；要原樣給使用者看的錯誤丟 `UserError` 或繼承它的類別）；`requireSession()` 與 `redirect()` 放在 `runAction()` 外面，`updateTags` 照 `.claude/rules/cache.md` 放 finally 或成功之後。模組的 `web/actions.ts` 不轉出 `FormState`，元件一律從 `@/core/ui/form-message` import。
- 日期時間顯示一律用 `core/time.ts`，不直接用 `Intl.DateTimeFormat`、`Intl.RelativeTimeFormat` 或 `toLocale*String`（ICU 版本不同時空白字元會變，CI 曾因此失敗；`architecture.test.ts` 檢查）。
- SQL 裡的時間：跟欄位比較（`lt(table.col, date)`）時 drizzle 會自己轉；寫在 `sql\`…\`` 運算式裡或跟它比較時，一律 `${date.toISOString()}::timestamptz`。drizzle 的 postgres-js 不轉 Date 物件，正式環境會丟錯；測試用的 PGlite 自己會轉而查不出來，要檢查送出的參數（`youtube:cleanup` 曾因此整個失敗，見 YouTube 的 `cleanup.integration.test.ts` 的 `dateParams`）。
