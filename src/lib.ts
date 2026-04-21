import type {
  TPSNavigationEvent,
  TTrackerOptions,
  TTrackerImpl
} from "./types";

import { TAudioEventData, setAudioObserved } from "./audio";
import { TObservedRootInfo } from "./types_priv";
import { TDwellEventData, setDwellObserved } from "./dwell";
import {
  TExternalLinkEventData,
  trackExternalLinks
} from "./external-links";
import {
  TScrollDepthEventData,
  setScrollDepthObserved
} from "./scroll-depth";
import { TVideoEventData, setVideosObserved } from "./video";
import { TModalEventData, setModalsObserved } from "./modals";
import { observeDOMAttachment } from "./dom-attachment";
import {
  TLogLevel,
  log,
  setLogLevel
} from "./util";

const kDefaultOptions: TTrackerOptions = {
  autoAttach: true,
  trackNavigation: true,
  trackExternalLinks: true,
  trackDwell: true,
  trackScrollDepth: true,
  trackAudioStart: true,
  trackAudioProgress: true,
  trackVideoStart: true,
  trackVideoProgress: true,
  trackModals: true,
};

const kAfterNavRetryMillis = 1500;
const kDefaultSelector = ".pagestrip-root";

const kPSNavigateEventName = "psNavigate";
const kPSAPIReadyEventName = "psApiReady";

export class PSTracker {
  private _observedElements: WeakMap<Element, TObservedRootInfo> =
    new WeakMap();
  private _watchedSelectors: Map<string, Partial<TTrackerOptions>> = new Map();
  private _selectors: Set<string> = new Set();

  constructor(private readonly _impl: TTrackerImpl) {
    if (document?.currentScript) {
      observeDOMAttachment(document.currentScript, () => {
        this._dispose();
      });
    }
  }
  
  public start(): void
  public start(selector: string): void
  public start(options: Partial<TTrackerOptions>): void
  public start(selector: string, options: Partial<TTrackerOptions>): void
  public start(
    selectorOrOptions?: string | Partial<TTrackerOptions>,
    maybeOptions?: Partial<TTrackerOptions>
  ): void {
    this._start(selectorOrOptions, maybeOptions);
  }

  private _start(
    selectorOrOptions?: string | Partial<TTrackerOptions>,
    maybeOptions?: Partial<TTrackerOptions>,
  ): void {
    const selector = "string" === typeof selectorOrOptions
      ? selectorOrOptions
      : undefined;
    const inOptions = "object" === typeof selectorOrOptions
      ? selectorOrOptions
      : "object" === typeof maybeOptions
      ? maybeOptions
      : undefined;
    
    const list = this._rootsForSelector(selector);
    
    if (!list.length) {
      const doAutoAttach = !!(
        inOptions?.autoAttach ?? kDefaultOptions.autoAttach
      );

      log(
        doAutoAttach ? "info" : "warn",
        `no elements matched "${
          selector ?? kDefaultSelector
        }"${doAutoAttach ? ", but observing DOM." : ""}`
      );

      if (doAutoAttach) {
        this._startSelectorWatch(
          selector ?? kDefaultSelector,
          inOptions ?? {}
        );
      }

      return;
    }
    
    let newTrackers = false;
    
    list.forEach(el => {
      const isNew = this._attachToElement(
        el, selector ?? kDefaultSelector, inOptions
      );
      newTrackers ||= isNew;
    });
    
    if (newTrackers) {
      this._replayEvents();
    }
  }
  
  public stop(selector?: string) {
    const list = this._rootsForSelector(selector);
    
    list.forEach(el => {
      this._detachElement(el);
    });

    this._stopSelectorWatch(selector ?? kDefaultSelector);
  }
  
  public setGlobalLogLevel(level: TLogLevel) {
    setLogLevel(level);
  }

  private _dispose() {
    this._selectors.forEach(selector => {
      this.stop(selector);
    });

    this._selectors.forEach(selector => {
      try {
        const els = document.querySelectorAll(selector);
        if (els?.length) {
          for (let i=0; i<els.length; i++) {
            this._detachElement(els.item(i));
          }
        }
      } catch (err) {
        log("warn", `error while disposing tracked elements: ${err}`);
      }
    });

    this._selectors.clear();

    log("info", `tracker disposed after DOM removal.`);
  }

  private _attachToElement(
    element: Element,
    selector: string,
    inOptions: Partial<TTrackerOptions> | undefined
  ): boolean {
    let newTracker = false;
    const existingInfo = this._observedElements.get(element);
    const wasActive = !!existingInfo?.active;
    const prevOptions = wasActive
      ? existingInfo.options
      : undefined;
    const nextOptions = Object.assign(
      {},
      existingInfo?.options ?? kDefaultOptions,
      inOptions ?? {}
    );
    
    if (!wasActive) {
      const listener = (event: CustomEvent<TPSNavigationEvent>) => {
        if (
          (element === document.documentElement || element.parentElement) &&
          this._observedElements.get(element)?.active
        ) {
          this._trackNavigation(element, event.detail);
        }
      };

      if (existingInfo) {
        existingInfo.options = nextOptions;
        existingInfo.listener = listener;
        existingInfo.active = true;
      } else {
        this._observedElements.set(element, {
          listener,
          options: nextOptions,
          navDisposers: [],
          afterNavTimeout: undefined,
          afterNavTasks: [],
          audios: new Map(),
          videos: new Map(),
          active: true,
          lastNavEvent: null,
          lastTimestamp: 0,
          domDetachDisposer: observeDOMAttachment(element, () => {
            this._onElementDidDOMDetach(element);
          })
        });

        this._selectors.add(selector);
      }
      
      element.addEventListener(kPSNavigateEventName as any, listener);
      newTracker = true;
    } else if (existingInfo) {
      existingInfo.options = nextOptions;
    }

    this._updateOptions(element, nextOptions, prevOptions);

    if (nextOptions.autoAttach) {
      this._startSelectorWatch(selector, nextOptions);
    }

    return newTracker;
  }

  private _detachElement(el: Element) {
    const info = this._observedElements.get(el);
    if (info?.active) {
      info.active = false;
      info.lastNavEvent = null;
      info.domDetachDisposer?.();
      info.domDetachDisposer = undefined;
      el.removeEventListener(kPSNavigateEventName as any, info.listener);
      this._disposeAfterNav(info);
    }
  }

  private _onElementDidDOMDetach(el: Element) {
    this._detachElement(el);
    this._observedElements.delete(el);
    log("info", "detached from element after DOM removal.");
  }

  private _startSelectorWatch(
    inSelector: string,
    options: Partial<TTrackerOptions>
  ) {
    const selector = inSelector ?? kDefaultSelector;

    if (0 === this._watchedSelectors.size) {
      document.addEventListener(kPSAPIReadyEventName as any, this._onApiInit);
    }

    this._watchedSelectors.set(selector, { ...(options ?? {}) });
  }

  private _stopSelectorWatch(inSelector: string) {
    const selector = inSelector ?? kDefaultSelector;
    this._watchedSelectors.delete(selector);
    if (0 === this._watchedSelectors.size) {
      document.removeEventListener(kPSAPIReadyEventName as any, this._onApiInit);
    }
  }

  private _onApiInit = (ev: CustomEvent<{ element: Element; }>) => {
    const { element } = ev.detail ?? {};
    if (element) {
      for (const [selector, options] of this._watchedSelectors) {
        if (element.matches(selector)) {
          log("info", `attaching to new target for selector "${selector}".`);
          this._attachToElement(element, selector, options ?? {});
          break;
        }
      }
    }
  }
  
  private _trackNavigation(element: Element, event: TPSNavigationEvent) {
    const info = this._observedElements.get(element);
    if (event && info?.active) {
      if (event.timestamp < info.lastTimestamp) {
        return;
      }

      info.lastNavEvent = event;
      info.lastTimestamp = event.timestamp;

      this._didNavigate(element);

      if (info?.options?.trackNavigation) {
        if (this._impl.trackNavigation) {
          log("info", `track navigation: ${event.standardizedURL}`);
          
          try {
            this._impl.trackNavigation({
              root: element, 
              navigationState: event
            });
          } catch (err) {
            log(
              "warn",
              `exception while tracking navigation ${
                event.standardizedURL
              }`,
              err?.toString?.()
            );
          }
        }
      }
    }
  }
  
  private _rootsForSelector(selector?: string) {
    let list: Array<Element> = [];
    
    if ("string" === typeof selector) {
      try {
        list = Array.from(document.querySelectorAll(selector));
      } catch (err) {
        log(
          "warn",
          `failed to select "${selector}", using .pagestrip-root...`,
           err?.toString?.()
        );
      }
      
      if (!list.length) {
        log(
          "warn",
          `no elements matched "${selector}", using .pagestrip-root...`
        );
      }
    }
    
    if (!list?.length) {
      list = Array.from(document.querySelectorAll(kDefaultSelector));
    }
    
    return list;
  }

  private _updateOptions(
    element: Element,
    current: TTrackerOptions,
    prev?: TTrackerOptions
  ) {
    const info = this._observedElements.get(element);
    
    if (info?.active) {    
      if (
        current?.trackAudioStart != prev?.trackAudioStart ||
        current?.trackAudioProgress != prev?.trackAudioProgress
      ) {
        setAudioObserved(
          element,
          info,
          !!(
            (current?.trackAudioStart && this._impl.trackAudioStart) ||
            (current?.trackAudioProgress && this._impl.trackAudioProgress)
          ),
          this._onAudioEvent.bind(this)
        );
      }

      if (
        current?.trackVideoStart != prev?.trackVideoStart ||
        current?.trackVideoProgress != prev?.trackVideoProgress
      ) {
        setVideosObserved(
          element,
          info,
          !!(
            (current?.trackVideoStart && this._impl.trackVideoStart) ||
            (current?.trackVideoProgress && this._impl.trackVideoProgress)
          ),
          this._onVideoEvent.bind(this)
        );
      }
      
      if (current?.trackDwell != prev?.trackDwell) {
        setDwellObserved(
          element,
          info,
          !!(current?.trackDwell && this._impl.trackDwell),
          this._onDwellEvent.bind(this)
        );
      }

      if (current?.trackScrollDepth != prev?.trackScrollDepth) {
        setScrollDepthObserved(
          element,
          info,
          !!(current?.trackScrollDepth && this._impl.trackScrollDepth),
          this._onScrollDepthEvent.bind(this)
        );
      }
      
      if (current?.trackExternalLinks != prev?.trackExternalLinks) {
        trackExternalLinks(
          element,
          info,
          !!(current?.trackExternalLinks && this._impl.trackExternalLink),
          this._onExternalLinkEvent.bind(this)
        );
      }

      if (current?.trackModals != prev?.trackModals) {
        setModalsObserved(
          element,
          info,
          !!(current?.trackModals && this._impl.trackModalElement),
          this._onModalEvent.bind(this)
        );
      }
    }
  }
  
  private _didNavigate(el: Element) {
    const info = this._observedElements.get(el);
    if (info) {
      this._disposeAfterNav(info);
      
      if (!!(
        (info.options?.trackVideoStart && this._impl.trackVideoStart) ||
        (info.options?.trackVideoProgress && this._impl.trackVideoProgress)
      )) {
        this._executeNavReaction(info, () => {
          setVideosObserved(
            el, info, true, this._onVideoEvent.bind(this)
          );
        });
      }

      if (!!(
        (info.options?.trackAudioStart && this._impl.trackAudioStart) ||
        (info.options?.trackAudioProgress && this._impl.trackAudioProgress)
      )) {
        this._executeNavReaction(info, () => {
          setAudioObserved(
            el, info, true, this._onAudioEvent.bind(this)
          );
        });
      }
      
      if (info.options.trackDwell && this._impl.trackDwell) {
        this._executeNavReaction(info, () => {
          setDwellObserved(el, info, true, this._onDwellEvent.bind(this));
        });
      }

      if (info.options.trackScrollDepth && this._impl.trackScrollDepth) {
        this._executeNavReaction(info, () => {
          setScrollDepthObserved(
            el, info, true, this._onScrollDepthEvent.bind(this)
          );
        });
      }
      
      if (info.options?.trackExternalLinks && this._impl.trackExternalLink) {
        this._executeNavReaction(info, () => {
          trackExternalLinks(
            el, info, true, this._onExternalLinkEvent.bind(this)
          );
        });
      }

      if (info.options?.trackModals && this._impl.trackModalElement) {
        this._executeNavReaction(info, () => {
          setModalsObserved(el, info, true, this._onModalEvent.bind(this));
        });
      }
    }
  }
  
  private _onVideoEvent(data: TVideoEventData) {
    if (!data?.root) {
      return;
    }
    
    const info = this._observedElements.get(data.root);
    let fn: ((event: TPSNavigationEvent) => void) | undefined
    let enabled = false;
    let errorContext: string | undefined;
     
    if (info?.active) {
      switch (data.event) {
        case "started": {
          enabled = !!info.options?.trackVideoStart;
          errorContext = `exception while tracking video ${data.id}`;
          fn = (event) => {
            if (this._impl.trackVideoStart) {
              log("info", `track video started`, data.id);
              this._impl.trackVideoStart({
                root: data.root,
                videoId: data.id,
                durationSecs: data.durationSecs,
                navigationState: event
              });
            }
          };
          break;
        }
        
        case "progress": {
          enabled = !!info.options?.trackVideoProgress;
          errorContext = `exception while tracking video ${data.id}`;
          fn = (event) => {
            if (this._impl.trackVideoProgress) {
              log("info", `track video progress`, data.id,data.pct.toString());
              this._impl.trackVideoProgress({
                root: data.root,
                videoId: data.id,
                durationSecs: data.durationSecs,
                percent: data.pct,
                navigationState: event
              });
            }
          };
          break;
        }
        
        default:
          break;
      }

      this._invokeTrackedAction(info, enabled, fn, errorContext);
    }
  }

  private _onAudioEvent(data: TAudioEventData) {
    if (!data?.root) {
      return;
    }

    const info = this._observedElements.get(data.root);
    let fn: ((event: TPSNavigationEvent) => void) | undefined
    let enabled = false;
    let errorContext: string | undefined;

    if (info?.active) {
      switch (data.event) {
        case "started": {
          enabled = !!info.options?.trackAudioStart;
          errorContext = `exception while tracking audio ${data.id}`;
          fn = (event) => {
            if (this._impl.trackAudioStart) {
              log("info", `track audio started`, data.id);
              this._impl.trackAudioStart({
                root: data.root,
                audioId: data.id,
                durationSecs: data.durationSecs,
                navigationState: event
              });
            }
          };
          break;
        }

        case "progress": {
          enabled = !!info.options?.trackAudioProgress;
          errorContext = `exception while tracking audio ${data.id}`;
          fn = (event) => {
            if (this._impl.trackAudioProgress) {
              log("info", `track audio progress`, data.id, data.pct.toString());
              this._impl.trackAudioProgress({
                root: data.root,
                audioId: data.id,
                durationSecs: data.durationSecs,
                percent: data.pct,
                navigationState: event
              });
            }
          };
          break;
        }

        default:
          break;
      }

      this._invokeTrackedAction(info, enabled, fn, errorContext);
    }
  }
  
  private _onDwellEvent(data: TDwellEventData) {
    if (!data?.root) {
      return;
    }

    const info = this._observedElements.get(data.root);

    this._invokeTrackedAction(
      info,
      !!info?.options?.trackDwell,
      this._impl.trackDwell
        ? (event) => {
            log("info", `track dwell`, data.seconds.toString());
            this._impl.trackDwell?.({
              root: data.root,
              seconds: data.seconds,
              navigationState: event
            });
          }
        : undefined,
      `exception while tracking dwell ${data.seconds}`
    );
  }

  private _onExternalLinkEvent(data: TExternalLinkEventData) {
    if (!data?.root) {
      return;
    }

    const info = this._observedElements.get(data.root);

    this._invokeTrackedAction(
      info,
      !!info?.options?.trackExternalLinks,
      this._impl.trackExternalLink
        ? (event) => {
            this._impl.trackExternalLink?.({
              root: data.root,
              url: data.url,
              target: data.target,
              navigationState: event
            });
          }
        : undefined,
      `exception while tracking external link ${data.url}`
    );
  }

  private _onScrollDepthEvent(data: TScrollDepthEventData) {
    if (!data?.root) {
      return;
    }

    const info = this._observedElements.get(data.root);

    this._invokeTrackedAction(
      info,
      !!info?.options?.trackScrollDepth,
      this._impl.trackScrollDepth
        ? (event) => {
            log("info", `track scroll depth`, data.percent.toString());
            this._impl.trackScrollDepth?.({
              root: data.root,
              percent: data.percent,
              navigationState: event
            });
          }
        : undefined,
      `exception while tracking scroll depth ${data.percent}`
    );
  }

  private _onModalEvent(data: TModalEventData) {
    if (!data?.root) {
      return;
    }

    const info = this._observedElements.get(data.root);

    this._invokeTrackedAction(
      info,
      !!info?.options?.trackModals,
      this._impl.trackModalElement
        ? (event) => {
            log("info", `track modal event ${data.event}${
              data.name ? `, name: ${data.name}` : ""
            }${
              "close" === data.event && !!data.openMillis
                ? `, duration: ${data.openMillis}ms` : "" 
            }`);

            this._impl.trackModalElement?.({
              root: data.root,
              event: data.event,
              modalName: data.name,
              openMillis: data.openMillis ?? null,
              navigationState: event
            });
          }
        : undefined,
      `exception while tracking modal ${data.event}`
    );
  }

  private _invokeTrackedAction(
    info: TObservedRootInfo | undefined,
    enabled: boolean,
    action: ((event: TPSNavigationEvent) => void) | undefined,
    errorContext?: string
  ) {
    if (!info?.active || !enabled || !info.lastNavEvent || !action) {
      return;
    }

    try {
      action(info.lastNavEvent);
    } catch (err) {
      if (errorContext) {
        log("warn", errorContext, err?.toString?.());
      }
    }
  }
  
  private _replayEvents() {
    this._withPSAPI(api => {
      api.get?.()?.replayEvents?.();
    });
  }
  
  private _withPSAPI(fn: (api: any) => void) {
    const api = (window as any)["pagestripClient"];
    if (api) {
      fn(api);
    }
  }
  
  private _executeNavReaction(
    info: TObservedRootInfo,
    action: () => void
  ) {
    action();
    
    if (null === info.afterNavTimeout) {
      return;
    }
    
    info.afterNavTasks.push(action);
    
    if (undefined === info.afterNavTimeout) {
      info.afterNavTimeout = setTimeout(() => {
        info.afterNavTimeout = null;
        info.afterNavTasks.forEach(fn => fn());
        info.afterNavTasks = [];
      }, kAfterNavRetryMillis);
    }
  }
  
  private _disposeAfterNav(info: TObservedRootInfo) {
    info.navDisposers.forEach(fn => fn());
    info.navDisposers = [];
    
    if (info.afterNavTimeout) {
      clearTimeout(info.afterNavTimeout);
    }
    
    info.afterNavTimeout = undefined;
    info.afterNavTasks = [];
  }
}
