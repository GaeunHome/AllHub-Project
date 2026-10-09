import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("../auth", () => ({ requireSession: vi.fn() }));
vi.mock("../auth/actions", () => ({ logout: vi.fn() }));

const session = mocksOf(await import("../auth"), "requireSession");
const { OwnerMenuLink } = await import("./app-header");

const ALICE = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", username: "alice" };

beforeEach(() => {
  session.requireSession.mockReset();
});

describe("導覽列的帳號選單", () => {
  it("站長_有「管理」，連到 /admin", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, role: "owner" });

    const item = await OwnerMenuLink();

    expect(item?.props).toMatchObject({ href: "/admin", children: "管理" });
  });

  it("一般成員_看不到「管理」", async () => {
    session.requireSession.mockResolvedValue({ ...ALICE, role: "member" });

    expect(await OwnerMenuLink()).toBeNull();
  });
});
