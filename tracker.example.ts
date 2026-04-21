import { PSTracker } from "./src/lib";
import type { TPSNavigationEvent, TTrackerImpl } from "./src/types";

const tracker = new PSTracker({
  // Called when Pagestrip navigates to new content.
  trackNavigation: event => {
    console.log("NAVIGATION", event.navigationState.standardizedURL);
  },
  
  // Called when a user clicks an outbound link.
  trackExternalLink: event => {
    console.log("EXT LINK", event.url);
  },
  
  // Called every 5 seconds while content is visible.
  trackDwell: event => {
    console.log("DWELL", event.seconds);
  },
  
  // Called in 10% read-depth steps.
  trackScrollDepth: event => {
    console.log("SCROLL DEPTH", event.percent);
  },

  trackAudioStart: event => {
    console.log("AUDIO STARTED", event.audioId);
  },

  trackAudioProgress: event => {
    console.log("AUDIO PROGRESS", event.audioId, event.percent);
  },
  
  trackVideoStart: event => {
    console.log("VIDEO STARTED", event.videoId);
  },
  
  trackVideoProgress: event => {
    console.log("VIDEO PROGRESS", event.videoId, event.percent);
  },

  // Called when a modal element opens or closes.
  trackModalElement: event => {
    console.log("MODAL", event.event, event.modalName, event.openMillis);
  },
} satisfies TTrackerImpl);

tracker.start();
