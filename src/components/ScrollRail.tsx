import { useCallback, useEffect, useRef, useState } from "react";

interface ScrollRailProps {
  onScroll: (amount: number) => void;
  onInteract: () => void;
}

const THUMB_HEIGHT = 92;
const EDGE_SCROLL_INTERVAL_MS = 70;
const EDGE_SCROLL_AMOUNT = 12;

/** 画面端の縦スクロールバー。iOS版 ContentView.scrollRail の移植。 */
export function ScrollRail({ onScroll, onInteract }: ScrollRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const edgeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const edgeDirection = useRef(0);

  const stopEdgeScroll = useCallback(() => {
    if (edgeTimer.current !== null) {
      clearInterval(edgeTimer.current);
      edgeTimer.current = null;
    }
    edgeDirection.current = 0;
  }, []);

  const startEdgeScroll = useCallback(
    (direction: number) => {
      if (edgeDirection.current === direction && edgeTimer.current !== null) return;
      stopEdgeScroll();
      edgeDirection.current = direction;
      onScroll(direction * EDGE_SCROLL_AMOUNT);
      edgeTimer.current = setInterval(
        () => onScroll(direction * EDGE_SCROLL_AMOUNT),
        EDGE_SCROLL_INTERVAL_MS,
      );
    },
    [onScroll, stopEdgeScroll],
  );

  useEffect(() => stopEdgeScroll, [stopEdgeScroll]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onInteract();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rail = railRef.current;
    if (!rail) return;

    const rect = rail.getBoundingClientRect();
    const limit = Math.max(0, (rect.height - THUMB_HEIGHT) / 2);
    const next = Math.max(
      -limit,
      Math.min(limit, event.clientY - rect.top - rect.height / 2),
    );
    const delta = next - offset;
    setOffset(next);
    onScroll(-delta / 1.5);

    if (limit > 0 && Math.abs(next) >= limit - 1) {
      startEdgeScroll(next > 0 ? -1 : 1);
    } else {
      stopEdgeScroll();
    }
  };

  const handlePointerEnd = () => {
    if (!dragging) return;
    setDragging(false);
    stopEdgeScroll();
    setOffset(0);
  };

  return (
    <div
      ref={railRef}
      className="scroll-rail"
      role="slider"
      aria-label="スクロール"
      aria-description="上下にドラッグしてWindows画面をスクロールします"
      aria-valuenow={0}
      aria-valuemin={-1}
      aria-valuemax={1}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onScroll(EDGE_SCROLL_AMOUNT);
        if (event.key === "ArrowDown") onScroll(-EDGE_SCROLL_AMOUNT);
      }}
    >
      <div
        className="scroll-rail__thumb"
        style={{
          height: THUMB_HEIGHT,
          transform: `translateY(${offset}px)`,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1)",
        }}
      >
        <span aria-hidden="true">▲</span>
        <span aria-hidden="true">≡</span>
        <span aria-hidden="true">▼</span>
      </div>
    </div>
  );
}
