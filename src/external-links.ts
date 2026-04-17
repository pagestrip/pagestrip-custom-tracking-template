import type { TObservedRootInfo } from "./types_priv";
import { registerGuardedListeners } from "./util";

export type TExternalLinkEventData = {
  root: Element;
  url: string;
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
  el: Element,
  info: TObservedRootInfo,
  enabled: boolean,
  onExternalLinkEvent?: (eventData: TExternalLinkEventData) => void
) {
  if (!el || !info || !enabled) {
    return;
  }

  const host = location.hostname;
  const links = Array.from(el.querySelectorAll("a, *[role=\"link\"]"));

  links.forEach(link => {
    const href = link.getAttribute("href");
    if (!href || link.getAttribute("data-ps-ext-link") === "true") {
      return;
    }

    const externalURL = resolveExternalURL(href, host);
    if (!externalURL) {
      return;
    }

    const fn = () => {
      if (info.active && info.options?.trackExternalLinks && onExternalLinkEvent) {
        onExternalLinkEvent({ root: el, url: externalURL });
      }
    };

    registerGuardedListeners(info, link, link, "ext-link", {
      click: fn,
    }, { capture: true });
  });
}
