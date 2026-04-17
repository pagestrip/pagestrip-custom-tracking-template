import type { TObservedRootInfo } from "./types_priv";
import { clearNodeHandled, nodeHandled } from "./util";

export type TDwellEventData = {
  root: Element;
  seconds: number;
};

export function setDwellObserved(
  root: Element,
  info: TObservedRootInfo,
  observed: boolean,
  onDwellEvent?: (eventData: TDwellEventData) => void
) {
  if (!root || !info || !observed) {
    return;
  }

  if (!nodeHandled(root, "dwell")) {
    let i = 0;
    const interval = setInterval(() => {
      if (
        info?.active &&
        info.options?.trackDwell &&
        "visible" === document.visibilityState &&
        onDwellEvent
      ) {
        onDwellEvent({ root, seconds: ++i * 5 });
      }
    }, 5000);

    info.navDisposers.push(() => {
      clearInterval(interval);
      clearNodeHandled(root, "dwell");
    });
  }
}
