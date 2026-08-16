/** 指を離した時点のジェスチャを、どのマウス操作として送るかの判定。 */

/** タップと判定する最大時間・移動量。iOS版の UITapGestureRecognizer に合わせた値。 */
export const TAP_MAX_DURATION_MS = 320;
export const TAP_MAX_MOVE_PX = 12;
export const DOUBLE_TAP_WINDOW_MS = 300;
export const LONG_PRESS_MS = 420;
export const LONG_PRESS_ALLOWED_MOVE_PX = 12;

export interface GestureSummary {
  /** 最初の指が触れてから最後の指が離れるまでの時間（ミリ秒）。 */
  durationMs: number;
  /** 指が動いた距離の合計（ピクセル）。 */
  travelled: number;
  /** 同時に触れていた指の最大数。 */
  maxPointers: number;
  /**
   * 直前のタップからの経過時間（ミリ秒）。
   * まだ一度もタップしていない場合は Infinity を渡す。
   * ここを 0 にすると「読み込んだ瞬間にタップした」扱いになり、
   * 最初のタップがダブルタップと誤判定されるので注意。
   */
  sinceLastTapMs: number;
}

export type GestureResult = "tap" | "double-tap" | "right-click" | "none";

export function classifyGesture({
  durationMs,
  travelled,
  maxPointers,
  sinceLastTapMs,
}: GestureSummary): GestureResult {
  const isTap = durationMs < TAP_MAX_DURATION_MS && travelled < TAP_MAX_MOVE_PX;
  if (!isTap) return "none";
  if (maxPointers >= 2) return "right-click";
  return sinceLastTapMs < DOUBLE_TAP_WINDOW_MS ? "double-tap" : "tap";
}
