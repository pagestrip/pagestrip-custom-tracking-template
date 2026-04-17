import { PSTracker } from "./src/lib";
import type { TPSNavigationEvent, TTrackerImpl } from "./src/types";

const tracker = new PSTracker({
  // Called when Pagestrip navigates to new content.
  trackNavigation: (_root: Element, event: TPSNavigationEvent) => {
    console.log("NAVIGATION", event);
  },
  
  // Called when a user clicks an outbound link.
  trackExternalLink: (
    _root: Element,
    url: string,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("EXT LINK", url);
  },
  
  // Called every 5 seconds while content is visible.
  trackDwell: (
    _root: Element,
    seconds: number,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("DWELL", seconds);
  },
  
  // Called in 10% read-depth steps.
  trackScrollDepth: (
    _root: Element,
    percent: number,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("SCROLL DEPTH", percent);
  },

  // Called once when audio playback starts.
  trackAudioStart: (
    _root: Element,
    audioId: string,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("AUDIO STARTED", audioId);
  },

  // Called in 10% audio progress steps.
  trackAudioProgress: (
    _root: Element,
    audioId: string,
    percent: number,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("AUDIO PROGRESS", audioId, percent);
  },
  
  // Called once when video playback starts.
  trackVideoStart: (
    _root: Element,
    videoId: string,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("VIDEO STARTED", videoId);
  },
  
  // Called in 10% video progress steps.
  trackVideoProgress: (
    _root: Element,
    videoId: string,
    percent: number,
    _navigationState: TPSNavigationEvent
  ) => {
    console.log("VIDEO PROGRESS", videoId, percent);
  },

  // Called when a modal element opens or closes.
  trackModalElement: (
    root: Element,
    event: "open" | "close",
    modalName: string | null,
    openMillis: number | null,
    navigationState: TPSNavigationEvent
  ) => {
    console.log("MODAL", event, modalName, openMillis);
  },
} satisfies TTrackerImpl);

tracker.start();
