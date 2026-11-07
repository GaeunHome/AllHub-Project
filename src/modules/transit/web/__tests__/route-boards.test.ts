import { beforeEach, describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("../../service/cached", () => ({ cachedDepartures: vi.fn(), cachedMetroDepartures: vi.fn(), cachedLive: vi.fn() }));

const cached = mocksOf(await import("../../service/cached"), "cachedDepartures", "cachedLive");
const { loadBoards } = await import("../route-boards");

const NOW = new Date("2026-11-05T10:00:00+08:00");
const TODAY = "2026-11-05";
const TOMORROW = "2026-11-06";
const stamp = (date: string, clock: string) => Date.parse(`${date}T${clock}:00+08:00`);
const train = (date: string, clock: string, trainNo: string) => ({ at: stamp(date, clock), arrivesAt: null, trainNo, kind: null, toward: null });
const route = (line: string) => ({ id: 1, userId: "u", mode: "tra" as const, system: "", line, originId: "1000", originName: "台北", destinationId: "1080", destinationName: "桃園", tracked: false, createdAt: NOW, sortOrder: 0 });
const schedule = (byDate: Record<string, ReturnType<typeof train>[]>) => cached.cachedDepartures.mockImplementation(async (_mode: string, _from: string, _to: string, date: string) => ({ ok: true, data: byDate[date] ?? [] }));

beforeEach(() => {
  cached.cachedDepartures.mockReset();
});

describe("存了車次的路線", () => {
  it("只留那一班，其他車次不列", async () => {
    schedule({ [TODAY]: [train(TODAY, "11:00", "111"), train(TODAY, "12:00", "123"), train(TODAY, "13:00", "131")] });

    const [board] = await loadBoards([route("123")], NOW);

    expect(board.departures.map((departure) => departure.trainNo)).toEqual(["123"]);
    expect(cached.cachedDepartures).toHaveBeenCalledTimes(1);
  });

  it("今天那班開走了_讀明天，卡片才有下一次", async () => {
    schedule({ [TODAY]: [train(TODAY, "08:00", "123")], [TOMORROW]: [train(TOMORROW, "08:00", "123")] });

    const [board] = await loadBoards([route("123")], NOW);

    expect(board.departures.map((departure) => departure.at)).toEqual([stamp(TODAY, "08:00"), stamp(TOMORROW, "08:00")]);
  });

  it("今天明天都沒有這班車_沒有班次，不會拿別班頂替", async () => {
    schedule({ [TODAY]: [train(TODAY, "11:00", "111")], [TOMORROW]: [train(TOMORROW, "11:00", "111")] });

    const [board] = await loadBoards([route("123")], NOW);

    expect(board.departures).toEqual([]);
    expect(board.problem).toBeNull();
  });
});

describe("存了車次的路線讀不到明天", () => {
  it("今天那班開走了、明天讀不到_回報讀不到，不能說成沒有這班車", async () => {
    cached.cachedDepartures.mockImplementation(async (_mode: string, _from: string, _to: string, date: string) => (date === TODAY ? { ok: true, data: [train(TODAY, "08:00", "123")] } : { ok: false, problem: "TDX 回 429" }));

    const [board] = await loadBoards([route("123")], NOW);

    expect(board.problem).toBe("TDX 回 429");
  });
});

describe("以前存的路線沒有車次", () => {
  it("照舊列出整段路的班次", async () => {
    schedule({ [TODAY]: [train(TODAY, "11:00", "111"), train(TODAY, "12:00", "123"), train(TODAY, "13:00", "131")] });

    const [board] = await loadBoards([route("")], NOW);

    expect(board.departures).toHaveLength(3);
  });
});
