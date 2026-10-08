import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// core 自己的資料表（core_）在 core/db/schema.ts；每個模組的在自己的 data/schema.ts，表名以模組 id 開頭（twitch_、starrail_）
export default defineConfig({
  schema: ["./src/core/db/schema.ts", "./src/modules/*/data/schema.ts"],
  out: "./src/core/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
