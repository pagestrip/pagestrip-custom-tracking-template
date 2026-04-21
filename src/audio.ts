import type { TObservedRootInfo } from "./types_priv";
import {
  log,
  registerGuardedListeners,
  nodeHandled,
  clearNodeHandled
} from "./util";

type TAudioEvent = "started" | "progress";
export type TAudioEventData = {
  event: TAudioEvent;
  root: Element;
  id: string;
  pct: number;
  durationSecs: number;
};

export function setAudioObserved(
  root: Element,
  info: TObservedRootInfo,
  observed: boolean,
  onAudioEvent?: (eventData: TAudioEventData) => void
) {
  if (!observed || !root) {
    return;
  }

  if (!nodeHandled(root, "detect-audio")) {
    const fn = () => {
      if (info.active) {
        setAudioObserved(root, info, true, onAudioEvent);
      }
    };
    
    root.addEventListener("loadstart", fn, { capture: true });
    
    info.navDisposers.push(() => {
      root.removeEventListener("loadstart", fn, { capture: true });
      clearNodeHandled(root, "detect-audio");
    });
  }

  info.navDisposers.push(() => {
    info.audios.clear();
  });

  const list = root.querySelectorAll("audio");
  for (let i=0; i<list.length; i++) {
    const aud = list.item(i);
    const id = (
      aud.querySelector("source")?.getAttribute("src") ??
      aud.getAttribute("src") ??
      "audio"
    ).trim();
    const m = id.match(/([\w]+)\.[\w]+$/);
    const reportId = m && m.length > 1 ? m[1] : id;
    const audio = aud as HTMLAudioElement;

    const onTimeUpdate = () => _processAudioUpdate(
      root, info, id, audio.currentTime, audio.duration, reportId, onAudioEvent
    );
    const onEnded = () => _processAudioUpdate(
      root, info, id, audio.duration, audio.duration, reportId, onAudioEvent
    );

    if (registerGuardedListeners(info, audio, aud, "tracked-audio", {
      timeupdate: onTimeUpdate,
      ended: onEnded,
    })) {
      log("info", `audio detected (id: ${reportId}).`);
    }
  }
}

function _processAudioUpdate(
  root: Element,
  info: TObservedRootInfo,
  id: string,
  curTime: number,
  totalTime?: number,
  reportId?: string,
  fn?: (eventData: TAudioEventData) => void,
) {
  const data = info.audios.get(id);
  let ttime = 0, curPct = 0, rid = reportId ?? id;

  if (!fn || !totalTime || !info.active) {
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

  info.audios.set(id, {
    duration: ttime,
    pct: pct > curPct ? pct : curPct,
    reportId: rid
  });
}
