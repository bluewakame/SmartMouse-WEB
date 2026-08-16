import { useCallback, useEffect, useRef } from "react";
import {
  DOUBLE_TAP_WINDOW_MS,
  LONG_PRESS_ALLOWED_MOVE_PX,
  LONG_PRESS_MS,
  classifyGesture,
} from "../lib/gesture";

interface TrackpadProps {
  enabled: boolean;
  dragLocked: boolean;
  onMove: (dx: number, dy: number) => void;
  onScroll: (dy: number) => void;
  onTap: () => void;
  onDoubleTap: () => void;
  onRightTap: () => void;
  onDragBegin: () => void;
  onDragEnd: () => void;
}

/**
 * 指の操作をマウス操作に変換する面。iOS版 TrackpadView の移植。
 *
 * - 1本指ドラッグ: カーソル移動
 * - 1本指タップ: 左クリック / 2回タップ: ダブルクリック
 * - 2本指タップ: 右クリック / 2本指ドラッグ: スクロール
 * - 長押し: 押しっぱなし（離すまでドラッグ）
 */
export function Trackpad({
  enabled,
  dragLocked,
  onMove,
  onScroll,
  onTap,
  onDoubleTap,
  onRightTap,
  onDragBegin,
  onDragEnd,
}: TrackpadProps) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startedAt: 0, maxPointers: 0, travelled: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActive = useRef(false);
  const pendingTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 0 にすると「読み込んだ瞬間にタップした」扱いになり、
  // 読み込み直後の最初のタップがダブルタップと誤判定される。
  const lastTapAt = useRef(Number.NEGATIVE_INFINITY);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const releaseLongPress = useCallback(() => {
    clearLongPressTimer();
    if (longPressActive.current) {
      longPressActive.current = false;
      onDragEnd();
    }
  }, [clearLongPressTimer, onDragEnd]);

  // 接続が切れた／ボタンでドラッグを固定したときに、押しっぱなしを残さない。
  useEffect(() => {
    if (!enabled || dragLocked) releaseLongPress();
  }, [enabled, dragLocked, releaseLongPress]);

  useEffect(
    () => () => {
      clearLongPressTimer();
      if (pendingTapTimer.current !== null) clearTimeout(pendingTapTimer.current);
    },
    [clearLongPressTimer],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointers.current.size === 0) {
      gesture.current = { startedAt: performance.now(), maxPointers: 0, travelled: 0 };
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current.maxPointers = Math.max(gesture.current.maxPointers, pointers.current.size);

    if (pointers.current.size === 1) {
      clearLongPressTimer();
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        if (pointers.current.size !== 1) return;
        if (gesture.current.travelled > LONG_PRESS_ALLOWED_MOVE_PX) return;
        if (dragLocked) return; // ボタンで固定中は二重に押し下げない。
        longPressActive.current = true;
        onDragBegin();
      }, LONG_PRESS_MS);
    } else {
      // 2本目が触れたらスクロール操作なので、長押しドラッグは取り消す。
      releaseLongPress();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    gesture.current.travelled += Math.hypot(dx, dy);

    if (pointers.current.size === 1) {
      onMove(dx, dy);
    } else {
      // 2本の指それぞれから届くので、指の数で割って平均の移動量にする。
      onScroll(dy / pointers.current.size);
    }
  };

  const finishGesture = () => {
    const { startedAt, maxPointers, travelled } = gesture.current;
    const now = performance.now();
    const result = classifyGesture({
      durationMs: now - startedAt,
      travelled,
      maxPointers,
      sinceLastTapMs: now - lastTapAt.current,
    });

    if (result === "none") return;

    if (result === "right-click") {
      onRightTap();
      return;
    }

    if (result === "double-tap") {
      if (pendingTapTimer.current !== null) {
        clearTimeout(pendingTapTimer.current);
        pendingTapTimer.current = null;
      }
      lastTapAt.current = Number.NEGATIVE_INFINITY;
      onDoubleTap();
      return;
    }

    lastTapAt.current = now;
    // ダブルタップと区別するため、iOS版と同じく単発タップは少し待ってから送る。
    pendingTapTimer.current = setTimeout(() => {
      pendingTapTimer.current = null;
      onTap();
    }, DOUBLE_TAP_WINDOW_MS);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size > 0) return;

    const hadLongPress = longPressActive.current;
    releaseLongPress();
    if (!hadLongPress) finishGesture();
  };

  return (
    <div
      className="trackpad"
      role="application"
      aria-label="タッチ操作エリア"
      aria-description="指でなぞってカーソル移動、1本指でタップ、2本指で右クリックします"
      data-enabled={enabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
