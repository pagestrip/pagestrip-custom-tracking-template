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
  pct: number;
};

const kYoutubeOrigins = new Set([
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
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
  
  [ _trackNativeVideos, _trackYoutubeVideos ].forEach(fn => fn(
    root, info, onVideoEvent
  ));
}

function _trackNativeVideos(
  root: Element,
  info: TObservedRootInfo,
  onVideoEvent?: (eventData: TVideoEventData) => void
) {
  const list = root.querySelectorAll("video, .kent-video-placeholder");
  for (let i=0; i<list.length; i++) {
    const vid = list.item(i);
    
    if (vid.classList.contains("kent-video-placeholder")) {
      continue;
    }

    const id = (
      vid.querySelector("source")?.getAttribute("src") ?? "video"
    ).trim();
    const m = id.match(/([\w]+)\.[\w]+$/);
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
  const ytIds: Map<string, boolean> = new Map();
  const guardedNodes: Element[] = [];
  const list = root.querySelectorAll(".videoFromYoutube[video-id]");
  for (let i=0; i<list.length; i++) {
    const vid = list.item(i);
    
    if (nodeHandled(vid, "tracked-video")) {
      continue;
    }

    guardedNodes.push(vid);
    
    const ytId = vid.getAttribute("video-id");
    if (ytId) {
      ytIds.set(`yt-${ytId}`, true);
    }
  }
  
  if (ytIds.size) {
    let lastEventVideoId = "";
    
    const fn = (event: MessageEvent<string>) => {
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
      
      data = data.info as any;
      
      if (data) {
        const videoId =
          `yt-${data?.id ?? data.videoData?.video_id ?? "vid"}`;

        if ("yt-vid" !== videoId) {
          if (!ytIds.get(videoId)) {
            // not our video.
            return;
          } else {
            lastEventVideoId = videoId;
          }
        }

        const duration = data.duration || data.progressState?.duration || 0;
        
        if (duration) {
          _processVideoUpdate(
            root, info, lastEventVideoId, data.currentTime ?? 0,
            data.duration, videoId, onVideoEvent
          );
        }
      }
    };

    window.addEventListener("message", fn);
    
    info.navDisposers.push(() => {
      window.removeEventListener("message", fn);
      guardedNodes.forEach(node => clearNodeHandled(node, "tracked-video"));
    });
  } else {
    guardedNodes.forEach(node => clearNodeHandled(node, "tracked-video"));
  }
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
  
  if (!fn || !totalTime || !info.active) {
    return;
  }
  
  if (!data) {
    fn({ root, event: "started", id: rid, pct: 0});
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
      fn({ root, event: "progress", id: rid, pct: qq });
    });
  }
  
  info.videos.set(id, {
    duration: ttime,
    pct: pct > curPct ? pct : curPct,
    reportId: rid
  });
}
