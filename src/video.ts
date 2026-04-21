import type { TObservedRootInfo } from "./types_priv";
import {
  log,
  nodeHandled,
  clearNodeHandled,
  registerGuardedListeners
} from "./util";

type TVideoEvent = "started" | "progress";
export type TVideoEventData = {
  event: TVideoEvent;
  root: Element;
  id: string;
  durationSecs: number;
  pct: number;
};

const kYoutubeOrigins = new Set([
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
]);

const kVimeoOrigins = new Set([
  "https://player.vimeo.com",
]);

export function setVideosObserved(
  root: Element,
  info: TObservedRootInfo,
  observed: boolean,
  onVideoEvent?: (eventData: TVideoEventData) => void
) {
  if (!observed || !root) {
    return;
  }
  
  if (!nodeHandled(root, "detect-video")) {
    const fn = () => {
      if (info.active) {
        setVideosObserved(root, info, true, onVideoEvent);
      }
    };
    
    root.addEventListener("loadstart", fn, { capture: true });
    
    info.navDisposers.push(() => {
      root.removeEventListener("loadstart", fn, { capture: true });
      clearNodeHandled(root, "detect-video");
    });
  }
  
  info.navDisposers.push(() => {
    info.videos.clear();
  });
  
  [
    _trackNativeVideos,
    _trackYoutubeVideos,
    _trackVimeoVideos
  ].forEach(fn => fn(
    root, info, onVideoEvent
  ));
}

function _trackNativeVideos(
  root: Element,
  info: TObservedRootInfo,
  onVideoEvent?: (eventData: TVideoEventData) => void
) {
  const list = root.querySelectorAll("video");
  for (let i=0; i<list.length; i++) {
    const vid = list.item(i);

    const id = (
      vid.querySelector("source")?.getAttribute("src") ??
      vid.getAttribute("src") ??
      "video"
    ).trim();
    const m = id.match(/([\w]+)\.[\w]+(#.*)$/);
    const reportId = m && m.length > 1 ? m[1] : id;

    const video = vid as HTMLVideoElement;

    const onTimeUpdate = () => _processVideoUpdate(
      root, info, id, video.currentTime, video.duration, reportId, onVideoEvent
    );
    const onEnded = () => _processVideoUpdate(
      root, info, id, video.duration, video.duration, reportId, onVideoEvent
    );
    
    if (registerGuardedListeners(info, video, vid, "tracked-video", {
      timeupdate: onTimeUpdate,
      ended: onEnded,
    })) {
      log("info", `video detected (id: ${reportId}).`);
    }
  }
}

function _trackYoutubeVideos(
  root: Element,
  info: TObservedRootInfo,
  onVideoEvent?: (eventData: TVideoEventData) => void
) {
  const knownIds = new Map<string, boolean>();
  const idMap = new Map<string, string>();
  
  const observeYTVideo = (event: MessageEvent<string>) => {
    if (!kYoutubeOrigins.has(event.origin) || !event?.data) {
      return;
    }

    let data: Record<string, any> | null = null;
    try { data = JSON.parse(event.data); } catch (err) { return };
    
    if (
      data?.event !== 'infoDelivery' ||
      undefined === data.id ||
      !data.info
    ) {
      return;
    }

    let vId = idMap.get(data.id?.toString());

    if (!vId && data?.info?.videoData?.video_id) {
      idMap.set(data.id.toString(), (vId = data.info.videoData.video_id));
    }
    
    if (!vId) {
      return;
    }

    data = data.info as any;
    
    if (data) {
      const videoId = `yt-${vId}`;

      let valid = knownIds.get(videoId);

      if ("boolean" !== typeof valid) {
        const source = _getIframeByContentWindow(
          root,
          `iframe[src^="https://www.youtube-nocookie.com/embed/"],
           iframe[src^="https://www.youtube.com/embed/"]`,
          event.source
        );

        knownIds.set(videoId, (valid = !!source));
      }

      if (!valid) {
        return;
      }

      const duration = data.duration || data.progressState?.duration || 0;
      
      if (duration) {
        _processVideoUpdate(
          root, info, videoId, data.currentTime ?? 0,
          duration, videoId, onVideoEvent
        );
      }
    }
  };

  window.addEventListener("message", observeYTVideo);
  
  info.navDisposers.push(() => {
    window.removeEventListener("message", observeYTVideo);
  });
}

function _trackVimeoVideos(
  root: Element,
  info: TObservedRootInfo,
  onVideoEvent?: (eventData: TVideoEventData) => void
) {
  const detectVimeoVideoReady = (event: MessageEvent<string>) => {
    if (!kVimeoOrigins.has(event.origin) || !event?.data) {
      return;
    }

    let data: Record<string, any> | null = null;
    try { data = JSON.parse(event.data); } catch (err) { return };
    
    if (data?.event !== 'ready') {
      return;
    }

    const source = _getIframeByContentWindow(
      root,
      `iframe[src^="https://player.vimeo.com/video/"]`,
      event.source
    );

    if (
      source &&
      (window as any)?.Vimeo?.Player
    ) {
      const vId = _getVideoIdFromIframe(source, "videoFromVimeo");

      if (!!vId && !nodeHandled(source, "vimeo-iframe")) {
        const videoId = `vimeo-${vId}`;
        try {
          const player = new (window as any).Vimeo.Player(source);
          if (player) {
            const fn = (ev: any) => {
              if (
                "number" === typeof ev?.duration && ev.duration &&
                "number" === typeof ev?.seconds
              ) {
                _processVideoUpdate(
                  root, info, videoId, ev.seconds,
                  ev.duration, videoId, onVideoEvent
                );
              }
            };

            player.on("timeupdate", fn);

            info.navDisposers.push(() => {
              player.off("timeupdate", fn);
              clearNodeHandled(source, "vimeo-iframe");
            });
          }
        } catch (err) {}
      }
    }
  };

  window.addEventListener("message", detectVimeoVideoReady);
  
  info.navDisposers.push(() => {
    window.removeEventListener("message", detectVimeoVideoReady);
  });
}

function _processVideoUpdate(
  root: Element,
  info: TObservedRootInfo,
  id: string,
  curTime: number,
  totalTime?: number,
  reportId?: string,
  fn?: (eventData: TVideoEventData) => void,
) {
  const data = info.videos.get(id);
  let ttime = 0, curPct = 0, rid = reportId ?? id;
  
  // check curTime > half a second, so that we do not detect poster frame
  // loading as video start.
  if (!fn || !totalTime || !info.active || curTime < 0.5) {
    return;
  }
  
  if (!data) {
    fn({ root, event: "started", id: rid, pct: 0, durationSecs: totalTime });
    ttime = totalTime;
  } else {
    ttime = data.duration;
    curPct = data.pct;
    rid = data.reportId;
  }
  
  const pct = Math.floor(((curTime / ttime) * 100) / 10) * 10;
  
  if (pct > 0 && pct > curPct) {
    let pp: number[] = [];
    for (let q=pct; q>curPct; q-=10) {
      pp.push(q);
    }
    pp.reverse().forEach(qq => {
      fn({ root, event: "progress", id: rid, pct: qq, durationSecs: ttime });
    });
  }
  
  info.videos.set(id, {
    duration: ttime,
    pct: pct > curPct ? pct : curPct,
    reportId: rid
  });
}

function _getIframeByContentWindow(
  root: Element,
  selector: string,
  sourceObject: MessageEventSource | null
) {
  if (null === sourceObject) {
    return undefined;
  }

  let source: HTMLIFrameElement | undefined = undefined;
  const elements: NodeListOf<HTMLIFrameElement> = root.querySelectorAll(
    selector
  );

  for (let i=0; i<elements.length; i++) {
    const el = elements.item(i);
    if (el.contentWindow === sourceObject) {
      source = el;
      break;
    }
  }

  return source;
}

function _getVideoIdFromIframe(
  iframe: HTMLIFrameElement,
  className: string
) {
  let p = iframe.parentElement;
  while (p) {
    if (p.classList.contains(className)) {
      return p.getAttribute("video-id") || undefined;
    }
    p = p.parentElement;
  }
  return undefined;
}
