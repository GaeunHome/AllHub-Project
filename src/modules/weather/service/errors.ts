import { UserError } from "@/core/form";

/** 給使用者看的錯誤 runAction 原樣顯示 其他錯誤只說失敗 */
export class WeatherUserError extends UserError {
  name = "WeatherUserError";
}
