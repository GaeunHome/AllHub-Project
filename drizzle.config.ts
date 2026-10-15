import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// 資料表只放在這兩種檔案 表名用 core_ 或模組 id 開頭
export default defineConfig({
  schema: ["./src/core/db/schema.ts", "./src/modules/*/data/schema.ts"],
  out: "./src/core/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
