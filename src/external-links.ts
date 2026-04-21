import type { TObservedRootInfo } from "./types_priv";
import { registerGuardedListeners } from "./util";

export type TExternalLinkEventData = {
  root: Element;
  url: string;
  target: string;
};

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function resolveExternalURL(href: string, currentHost: string) {
  try {
    const url = new URL(href, location.href);

    if (url.protocol === "javascript:") {
      return null;
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return normalizeHostname(url.hostname) !== normalizeHostname(currentHost)
        ? url.href
        : null;
    }

    return url.href;
  } catch (err) {
    return null;
  }
}

export function trackExternalLinks(
  root: Element,
  info: TObservedRootInfo,
  enabled: boolean,
  onExternalLinkEvent?: (eventData: TExternalLinkEventData) => void
) {
  if (!root || !info || !enabled) {
    return;
  }

  const host = location.hostname;

  const checkLinkClick = (ev: MouseEvent) => {
    if (ev.target instanceof Element) {
      const pLink = ev.target.closest("a, *[role=\"link\"]");
      
      if (pLink) {
        const href = pLink.getAttribute("href");
        if (!href || pLink.getAttribute("data-ps-ext-link") === "true") {
          return;
        }

        const externalURL = resolveExternalURL(href, host);
        if (!externalURL) {
          return;
        }

        if (
          info.active &&
          info.options?.trackExternalLinks &&
          onExternalLinkEvent
        ) {
          onExternalLinkEvent({
            root,
            url: externalURL,
            target: pLink.getAttribute("target") || "_self"
          });
        }
      }
    }
  };

  registerGuardedListeners(info, root, root, "ext-link", {
    mousedown: checkLinkClick as EventListener
  }, { capture: true });
}
