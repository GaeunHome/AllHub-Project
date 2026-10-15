import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only 在測試環境會直接丟錯 換成空模組
      "server-only": fileURLToPath(new URL("./src/dev/server-only-stub.ts", import.meta.url)),
      // next/cache 在 Next 的請求外會丟錯 換成 spy 讓測試直接檢查失效
      "next/cache": fileURLToPath(new URL("./src/dev/next-cache-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // 每個測試前清空 next/cache 的 spy
    setupFiles: ["src/dev/vitest-setup.ts"],
    // 整合測試每次都要啟動 PGlite 並套 migration 平行跑時偶爾超過預設的 10 秒
    hookTimeout: 60_000,
    // 預設依核心數平行跑 機器忙時 PGlite 啟動太慢會逾時 固定 4 個比較穩
    maxWorkers: 4,
  },
});
