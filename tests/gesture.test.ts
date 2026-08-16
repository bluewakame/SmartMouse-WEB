import { describe, expect, it } from "vitest";
import { classifyGesture, type GestureSummary } from "../src/lib/gesture";

const tap: GestureSummary = {
  durationMs: 60,
  travelled: 2,
  maxPointers: 1,
  sinceLastTapMs: Number.POSITIVE_INFINITY,
};

describe("classifyGesture", () => {
  it("短く触れて離したら左クリック", () => {
    expect(classifyGesture(tap)).toBe("tap");
  });

  it("読み込み後の最初のタップをダブルタップにしない", () => {
    // 経過時間の初期値を 0 にすると「読み込んだ瞬間にタップした」扱いになり、
    // 読み込み直後の1回目のタップがダブルクリックとして送られてしまう。
    expect(classifyGesture({ ...tap, sinceLastTapMs: Number.POSITIVE_INFINITY })).toBe("tap");
    expect(classifyGesture({ ...tap, sinceLastTapMs: 12_000 })).toBe("tap");
  });

  it("続けて2回タップしたらダブルクリック", () => {
    expect(classifyGesture({ ...tap, sinceLastTapMs: 120 })).toBe("double-tap");
  });

  it("間隔が空いた2回目は単発のタップ", () => {
    expect(classifyGesture({ ...tap, sinceLastTapMs: 400 })).toBe("tap");
  });

  it("2本指で触れて離したら右クリック", () => {
    expect(classifyGesture({ ...tap, maxPointers: 2 })).toBe("right-click");
    // 2本指はダブルタップ扱いより優先する。
    expect(classifyGesture({ ...tap, maxPointers: 2, sinceLastTapMs: 100 })).toBe("right-click");
  });

  it("動かした場合や長く触れた場合はクリックしない", () => {
    expect(classifyGesture({ ...tap, travelled: 40 })).toBe("none");
    expect(classifyGesture({ ...tap, durationMs: 900 })).toBe("none");
  });
});
