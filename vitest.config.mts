import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only 在測試環境會直接丟錯，換成空模組
      "server-only": fileURLToPath(new URL("./src/dev/server-only-stub.ts", import.meta.url)),
      // next/cache 離開 Next 的請求環境會丟錯，換成 spy；要檢查失效的測試直接對它斷言
      "next/cache": fileURLToPath(new URL("./src/dev/next-cache-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // 每個測試前清空 next/cache 的 spy
    setupFiles: ["src/dev/vitest-setup.ts"],
    // 整合測試每個測試都啟動一次 PGlite（WASM）並套 migration，多個檔案平行跑時偶爾超過預設的 10 秒
    hookTimeout: 60_000,
  },
});
