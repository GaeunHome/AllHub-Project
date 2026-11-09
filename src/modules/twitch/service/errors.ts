import { UserError } from "@/core/form";

/** 訊息直接顯示在畫面上 */
export class TwitchUserError extends UserError {
  name = "TwitchUserError";
}
