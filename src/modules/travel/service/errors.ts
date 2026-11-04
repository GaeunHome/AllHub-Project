import { UserError } from "@/core/form";

/** 訊息直接給使用者看 */
export class TravelUserError extends UserError {
  name = "TravelUserError";
}

/** 別人的旅程跟不存在的一樣 不透露那趟旅程在不在 */
export class TripNotFoundError extends TravelUserError {
  name = "TripNotFoundError";
  constructor() {
    super("找不到這趟旅程，請重新整理頁面");
  }
}
