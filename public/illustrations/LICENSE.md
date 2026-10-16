# 插圖來源與授權

`finance/` 的插圖來自 [unDraw](https://undraw.co)，作者 Katerina Limpitsouni，依 [unDraw License](https://undraw.co/license) 使用（2026-10-16 確認的條款）：

- 可以免費用在商業與非商業用途，可以修改，不必標示出處或取得同意。
- 不能拿來做類似或競爭的插圖服務，也不能把插圖整理成素材包散布。
- 不能用來訓練、微調或測試 AI 與機器學習模型。

| 檔案 | 原圖 |
|---|---|
| `finance/setup.svg` | [Setup Wizard](https://undraw.co/illustration/setup-wizard_45kx) |
| `finance/no-accounts.svg` | [Online Banking](https://undraw.co/illustration/online-banking_l9sn) |
| `finance/no-holdings.svg` | [Investing](https://undraw.co/illustration/investing_uzcu) |
| `finance/no-recurring.svg` | [Schedule](https://undraw.co/illustration/schedule_ry1w) |
| `finance/all-done.svg` | [All Checked](https://undraw.co/illustration/all-checked_d3u6) |

修改的地方：拿掉固定的寬高、外面包一層 `<g id="art">` 讓頁面用 `<use>` 引用，顏色改成 CSS 變數（`--illu-accent` 等，括號裡留原本的顏色當備用），主色換成理財模組的綠色，深色模式另外換一組顏色（定義在 `src/app/globals.css` 的 `.fin-illustration`）。膚色照原圖。
