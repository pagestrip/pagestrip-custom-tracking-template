import type { TObservedRootInfo } from "./types_priv";
import { registerGuardedListeners } from "./util";

type TModalEvent = "open" | "close";
export type TModalEventData = {
  event: TModalEvent;
  root: Element;
  name: string | null;
  openMillis?: number | null;
};
type TModalEventEmittedEventDetails = {
  action: TModalEvent,
  name: string;
  openDurationMillis?: number;
};

declare global {
  interface HTMLElementEventMap {
    "psModalElement": CustomEvent<TModalEventEmittedEventDetails>;
  }
}

export function setModalsObserved(
  root: Element,
  info: TObservedRootInfo,
  observed: boolean,
  onModalEvent?: (eventData: TModalEventData) => void
) {
  if (!observed || !root) {
    return;
  }

  const fn = (ev: CustomEvent<TModalEventEmittedEventDetails>) => {
    if (info.active && info.options?.trackModals && onModalEvent) {
      const detail = ev?.detail;

      if (detail) {
        onModalEvent({
          root,
          event: detail.action,
          name: detail.name || null,
          openMillis: "close" === detail.action
            ? detail.openDurationMillis
            : undefined
        });
      }
    }
  };

  registerGuardedListeners(info, root, root, "track-modals", {
    "psModalElement": fn as EventListener
  });
}
