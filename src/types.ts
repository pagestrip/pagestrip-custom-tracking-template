export type TPSNavigationEvent = {
  /** true if the content is the index page of the current embed/publisher. */
  isIndex: boolean;
  /** title of the current content, without breadcrumbs. */
  title: string;
  /** BCP 47 language code of the current content. */
  language: string;
  /** pagestrip-internal type of the content, like "Page", "Story", etc... */
  contentType?: string;
  /** effective URL of the content, without pagestrip-internal parameters. */
  standardizedURL: string;
  /** canonical URL of the current content, if a canonical is available. */
  canonicalURL?: string;
  /** lookupId of the given content, if available, or null */
  lookupId?: string | null;
  /** slug of the given content, if available, or null */
  slug?: string | null;
  /** tags, as record from "group name" to "array of tag names", or null */
  tags?: Record<string, string[]>;
  /** sequence number of navigation events in session, starting at 0 */
  sequenceNumber: number;
  /** timestamp (retval of Date.now()) of when this event was generated */
  timestamp: number;
};

export type TTrackerOptions = {
  autoAttach: boolean;
  trackNavigation: boolean;
  trackDwell: boolean;
  trackExternalLinks: boolean;
  trackScrollDepth: boolean;
  trackAudioStart: boolean;
  trackAudioProgress: boolean;
  trackVideoStart: boolean;
  trackVideoProgress: boolean;
  trackModals: boolean;
}

export interface TTrackerImpl {
  trackNavigation?: (root: Element, event: TPSNavigationEvent) => void;
  
  trackExternalLink?: (
    root: Element,
    url: string,
    navigationState: TPSNavigationEvent
  ) => void;
  
  trackDwell?: (
    root: Element,
    seconds: number,
    navigationState: TPSNavigationEvent
  ) => void;

  trackScrollDepth?: (
    root: Element,
    percent: number,
    navigationState: TPSNavigationEvent
  ) => void;

  trackAudioStart?: (
    root: Element,
    audioId: string,
    navigationState: TPSNavigationEvent
  ) => void;

  trackAudioProgress?: (
    root: Element,
    audioId: string,
    percent: number,
    navigationState: TPSNavigationEvent
  ) => void;
  
  trackVideoStart?: (
    root: Element,
    videoId: string,
    navigationState: TPSNavigationEvent
  ) => void;
  
  trackVideoProgress?: (
    root: Element,
    videoId: string,
    percent: number,
    navigationState: TPSNavigationEvent
  ) => void;

  trackModalElement?: (
    root: Element,
    event: "open" | "close",
    modalName: string | null,
    openMillis: number | null,
    navigationState: TPSNavigationEvent
  ) => void;
}
