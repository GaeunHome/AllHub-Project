import { describe, expect, it } from "vitest";
import { fail, ok, valueOrThrow } from "../parsed";

class DemoUserError extends Error {
  name = "DemoUserError";
}

describe("valueOrThrow：service 拆開解析結果", () => {
  it("成功時回傳值", () => {
    expect(valueOrThrow(ok({ title: "京都" }), DemoUserError)).toEqual({ title: "京都" });
  });

  it("失敗時丟出模組自己的使用者錯誤 訊息原樣給畫面", () => {
    expect(() => valueOrThrow(fail("請填名稱"), DemoUserError)).toThrow(new DemoUserError("請填名稱"));
    expect(() => valueOrThrow(fail("請填名稱"), DemoUserError)).toThrow(DemoUserError);
  });
});
