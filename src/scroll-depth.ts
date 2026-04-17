import type { TObservedRootInfo } from "./types_priv";
import { registerGuardedListeners } from "./util";

export type TScrollDepthEventData = {
  root: Element;
  percent: number;
};

const kScrollDepthStepPct = 10;
const kScrollDepthBottomOffsetPx = 300;

export function setScrollDepthObserved(
  root: Element,
  info: TObservedRootInfo,
  observed: boolean,
  onScrollDepthEvent?: (eventData: TScrollDepthEventData) => void
) {
  if (!root || !info || !observed) {
    return;
  }

  let lastReportedPct = 0;

  const emitScrollDepth = () => {
    if (!info.active || !info.options?.trackScrollDepth || !onScrollDepthEvent) {
      return;
    }

    const percent = _currentScrollDepthPct(root);
    const nextPct = Math.floor(percent / kScrollDepthStepPct) * kScrollDepthStepPct;

    if (nextPct <= lastReportedPct || nextPct <= 0) {
      return;
    }

    for (
      let pct = lastReportedPct + kScrollDepthStepPct;
      pct <= nextPct;
      pct += kScrollDepthStepPct
    ) {
      onScrollDepthEvent({ root, percent: pct });
    }

    lastReportedPct = nextPct;
  };

  if (registerGuardedListeners(info, window, root, "scroll-depth", {
    scroll: emitScrollDepth,
    resize: emitScrollDepth,
  }, { passive: true })) {
    emitScrollDepth();
  }
}

function _currentScrollDepthPct(root: Element) {
  const rect = root.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const effectiveScrollable =
    rect.height - viewportHeight - kScrollDepthBottomOffsetPx;

  if (effectiveScrollable <= 0) {
    return _intersectsViewport(rect, viewportHeight) ? 100 : 0;
  }

  const consumed = Math.max(-rect.top, 0);
  return Math.max(0, Math.min(100, (consumed / effectiveScrollable) * 100));
}

function _intersectsViewport(rect: DOMRect, viewportHeight: number) {
  return rect.bottom > 0 && rect.top < viewportHeight;
}
