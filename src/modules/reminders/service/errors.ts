import { UserError } from "@/core/form";

/** 給使用者看的錯誤 runAction 原樣顯示 其他錯誤只說失敗 */
export class ReminderUserError extends UserError {
  name = "ReminderUserError";
}

/** 別人的 刪掉的或格式不對的 id 都用同一句 不透露那筆資料存不存在 */
export class ReminderNotFoundError extends ReminderUserError {
  name = "ReminderNotFoundError";

  constructor() {
    super("找不到這個提醒，請重新整理頁面");
  }
}
