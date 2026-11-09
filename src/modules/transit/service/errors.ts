import { UserError } from "@/core/form";

export class TransitUserError extends UserError {
  name = "TransitUserError";
}

export class RouteNotFoundError extends TransitUserError {
  name = "RouteNotFoundError";
  constructor() {
    super("找不到這條路線，請重新整理頁面");
  }
}
