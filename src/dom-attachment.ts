const kMutKey = "__psTrackDetachObs";

export function observeDOMAttachment(
  element: Element,
  onDetached: () => void
) {
  let mut: MutationObserver | undefined = (element as any)[kMutKey];
  let parents: Map<Node, boolean> | undefined = new Map();

  if (!mut && element.parentElement) {
    mut =
      (element as any)[kMutKey] ||
      new MutationObserver((m) => {
        m.forEach((mm) => {
          if (
            mut &&
            parents &&
            "childList" === mm.type &&
            mm.removedNodes?.length
         ) {
            for (let i = 0; i < mm.removedNodes.length; i++) {
              const node = mm.removedNodes.item(i);
              if (node && parents.get(node)) {
                setTimeout(() => {
                  if (mut) {
                    mut.disconnect();
                  }

                  if ((element as any)[kMutKey]) {
                    delete (element as any)[kMutKey];
                  }

                  if (parents) {
                    parents.clear();
                    parents = undefined;
                  }

                  let p = element,
                    attached = false;

                  while ((p = p.parentElement as Element)) {
                    if (p === document.body) {
                      attached = true;
                      break;
                    }
                  }

                  if (attached) {
                    observeDOMAttachment(element, onDetached);
                  } else {
                    onDetached();
                  }
                }, 0);
              }
            }
          }
        });
      });

    let el = element as Element;
    while (mut && el && el != document.documentElement) {
      parents.set(el, true);
      mut.observe(el, { childList: true });
      el = el.parentElement as Element;
    }

    (element as any)[kMutKey] = mut;
  }

  return () => mut?.disconnect?.();
}
