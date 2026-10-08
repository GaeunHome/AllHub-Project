import { describe, expect, it } from "vitest";
import { parseDailyNote } from "./responses";
import { alertThreshold, staminaAlertAction } from "./stamina";

const note = (stamina: number | null, max: number | null = 240) =>
  parseDailyNote({ current_stamina: stamina, max_stamina: max });

describe("alertThreshold", () => {
  it("defaults to max minus 20", () => {
    expect(alertThreshold(note(0), null)).toBe(220);
  });

  it("prefers the account's custom threshold", () => {
    expect(alertThreshold(note(0), 200)).toBe(200);
  });

  it("is null when max stamina is unknown and no custom value", () => {
    expect(alertThreshold(note(0, null), null)).toBeNull();
  });
});

describe("staminaAlertAction", () => {
  it("alerts when reaching the threshold for the first time", () => {
    expect(staminaAlertAction(note(220), null, false)).toBe("alert");
  });

  it("stays quiet while still above the threshold after alerting", () => {
    expect(staminaAlertAction(note(240), null, true)).toBe("none");
  });

  it("resets once stamina drops below the threshold", () => {
    expect(staminaAlertAction(note(100), null, true)).toBe("reset");
  });

  it("does nothing below the threshold when not alerted", () => {
    expect(staminaAlertAction(note(219), null, false)).toBe("none");
  });

  it("does nothing when stamina is unknown", () => {
    expect(staminaAlertAction(note(null), null, false)).toBe("none");
  });
});
