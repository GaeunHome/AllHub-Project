SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "card_style" text;--> statement-breakpoint
ALTER TABLE "savings_categories" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_card_style" CHECK ("savings_accounts"."card_style" is null or ("savings_accounts"."kind" = 'credit' and "savings_accounts"."card_style" in ('blue', 'green', 'purple', 'orange', 'black', 'silver')));--> statement-breakpoint
-- 用途名稱填進帳戶的 label 信用卡沒有用途
UPDATE "savings_accounts" SET "label" = "savings_purposes"."name" FROM "savings_purposes" WHERE "savings_accounts"."purpose_id" = "savings_purposes"."id" AND "savings_accounts"."kind" <> 'credit' AND "savings_accounts"."label" IS NULL;--> statement-breakpoint
-- 依分類名稱補上圖示
UPDATE "savings_categories" SET "icon" = v."icon" FROM (VALUES ('餐飲', 'utensils'), ('飲料', 'coffee'), ('日用品', 'shopping-cart'), ('交通', 'bus'), ('汽機車', 'car'), ('加油', 'fuel'), ('房租', 'house'), ('電費', 'zap'), ('水費', 'droplet'), ('網路', 'wifi'), ('手機', 'smartphone'), ('購物', 'shopping-bag'), ('服飾', 'shirt'), ('美容', 'scissors'), ('醫療', 'heart-pulse'), ('保險', 'shield'), ('教育', 'graduation-cap'), ('書籍', 'book-open'), ('娛樂', 'film'), ('遊戲', 'gamepad-2'), ('旅遊', 'plane'), ('寵物', 'paw-print'), ('運動', 'dumbbell'), ('禮物', 'gift'), ('訂閱', 'repeat'), ('帳單', 'receipt'), ('提領現金', 'banknote'), ('薪水', 'briefcase'), ('獎金', 'award'), ('投資收益', 'trending-up'), ('利息', 'percent'), ('其他', 'circle-dot')) AS v("name", "icon") WHERE "savings_categories"."name" = v."name" AND "savings_categories"."icon" IS NULL;
