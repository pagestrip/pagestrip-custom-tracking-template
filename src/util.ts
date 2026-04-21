import type { TObservedRootInfo } from "./types_priv";

export type TLogLevel = "error" | "warn" | "info";

const __logLevels = [ "info", "warn", "error" ];

if ("number" !== typeof (window as any).__pthLogLevel) {
  (window as any).__pthLogLevel = 1;
}

export function setLogLevel(level: TLogLevel) {
  const idx = __logLevels.indexOf(level);
  if (idx >= 0 && idx < __logLevels.length) {
    (window as any).__pthLogLevel = idx;
  }
}

export function log(level: TLogLevel, ...messages: (string | undefined)[]) {
  const minLevel = (window as any).__pthLogLevel ?? 1;
  if (messages.length && __logLevels.indexOf(level) >= minLevel) {
    console[level](
      `[pagestrip tracking]: ${messages.filter(Boolean).join(" : ")}`
    );
  }
}

export function nodeHandled(node: Element, guard: string) {
  const guardAttr = `data-ps-pth-${guard}`;
  
  if (node.getAttribute(guardAttr) === "true") {
    return true;
  }
  
  node.setAttribute(guardAttr, "true");
  
  return false;
}

export function clearNodeHandled(node: Element, guard: string) {
  if (node) {
    node.removeAttribute(`data-ps-pth-${guard}`);
  }
}

export function registerGuardedListeners(
  info: TObservedRootInfo,
  target: EventTarget,
  guardNode: Element,
  guard: string,
  listeners: Record<string, EventListenerOrEventListenerObject>,
  options?: AddEventListenerOptions | boolean
) {
  if (nodeHandled(guardNode, guard)) {
    return false;
  }

  const eventNames: string[] = [];

  for (const eventName in listeners) {
    const listener = listeners[eventName];
    eventNames.push(eventName);
    target.addEventListener(eventName, listener, options);
  }

  info.navDisposers.push(() => {
    eventNames.forEach(eventName => {
      const listener = listeners[eventName];
      target.removeEventListener(eventName, listener, options);
    });

    clearNodeHandled(guardNode, guard);
  });

  return true;
}
