# AGENTS.md

This repository supports two very different tasks:

1. Implement a concrete tracker for one website or publisher.
2. Change the tracking framework itself.

Most users only want to implement a concrete tracker. If that is your goal, you should work in `tracker.ts` and leave `src/` alone.

## Main Rule

If you are implementing your own analytics tracker:

- Copy `tracker.ts.example` to `tracker.ts`.
- Edit `tracker.ts`.
- Do not change files in `src/`.
- Do not refactor the framework.
- Do not add new tracking features in `src/` unless you intentionally want to improve the framework for everyone.

`src/` contains the shipped framework.

`tracker.ts` is your local integration file and is gitignored on purpose.

## Quick Start

1. Copy `tracker.ts.example` to `tracker.ts`.
2. Open `tracker.ts`.
3. Remove every handler function you do not need.
4. Replace the `console.log(...)` examples with calls to your own analytics system.
5. Keep `tracker.start()` unless you have a specific reason to change it.
6. Run `npm run build`.

## Files To Care About

If you are only implementing a tracker, these are the only files you normally need:

- `tracker.ts.example`
- `tracker.ts`
- `src/types.ts`

If you are not working on the framework itself, ignore these files:

- `src/lib.ts`
- `src/audio.ts`
- `src/video.ts`
- `src/dwell.ts`
- `src/scroll-depth.ts`
- `src/external-links.ts`
- `src/modals.ts`
- `src/util.ts`
- `src/types_priv.ts`

## Normal Workflow

The normal workflow for a custom tracker is:

1. Copy `tracker.ts.example` to `tracker.ts`.
2. Delete the handlers you do not need.
3. Implement the handlers you do need.
4. Run `npm run build`.

That is usually all.

If you find yourself changing logic in `src/`, you are probably no longer implementing a tracker. You are changing the framework.

## Recommended Default

For most users, this is the right level of complexity:

```ts
import { PSTracker } from "./src/lib";

const tracker = new PSTracker({
  trackNavigation: (_root, event) => {
    // send page view
  },

  trackExternalLink: (_root, url, nav) => {
    // send outbound click
  },
});

tracker.start();
```

For most projects:

- `tracker.start()` without arguments is correct.
- The default `.pagestrip-root` selector is correct.
- Removing unused handler functions is enough.
- You usually do not need custom options.

## How To Disable Things

If you do not want a tracking feature, remove its handler from the object passed to `new PSTracker(...)`.

Examples:

- If you do not care about audio tracking, remove `trackAudioStart` and `trackAudioProgress`.
- If you do not care about scroll depth, remove `trackScrollDepth`.
- If you do not care about dwell time, remove `trackDwell`.

This is the normal customization path.

## About `start(...)` Options

`PSTracker` also supports options such as enabling or disabling framework features.

Most users do not need them.

Only use `start(...)` options if you explicitly want the framework itself to skip setting up a feature.

Example:

```ts
tracker.start({
  trackScrollDepth: false,
  trackDwell: false,
});
```

If you are unsure, keep `tracker.start()` without options.

## Available Hooks

The framework currently supports these optional handler methods on `TTrackerImpl`:

- `trackNavigation(root, event)`
- `trackExternalLink(root, url, navigationState)`
- `trackDwell(root, seconds, navigationState)`
- `trackScrollDepth(root, percent, navigationState)`
- `trackAudioStart(root, audioId, navigationState)`
- `trackAudioProgress(root, audioId, percent, navigationState)`
- `trackVideoStart(root, videoId, navigationState)`
- `trackVideoProgress(root, videoId, percent, navigationState)`
- `trackModalElement(root, event, modalName, openMillis, navigationState)`

The exact TypeScript signatures live in `src/types.ts`.

## What The Hooks Mean

### `trackNavigation`

Called when Pagestrip navigates to a new content item.

Use this for:

- page views
- content views
- screen view style events

Useful fields on `TPSNavigationEvent` include:

- `standardizedURL`
- `canonicalURL`
- `title`
- `language`
- `contentType`
- `lookupId`
- `slug`
- `tags`
- `sequenceNumber`
- `timestamp`

### `trackExternalLink`

Called when the user clicks an outbound link inside the tracked root.

Current behavior:

- different subdomains count as external
- `www.example.com` and `example.com` are treated as the same host
- `mailto:`, `tel:`, and custom schemes count as external
- `javascript:` links are ignored

Use this for:

- outbound click tracking
- affiliate click tracking
- mailto or tel interaction tracking

### `trackDwell`

Called every 5 seconds while the tracked content is visible.

Use this for:

- engaged time
- active reading time
- time-on-content style metrics

### `trackScrollDepth`

Called in 10% steps from `10` to `100`.

Behavior:

- the first viewport worth of content counts as `0%`
- `100%` is reached slightly before the true bottom
- short content can report `100%` immediately when visible
- percentages are never reported twice during one navigation cycle

Use this for:

- read depth
- engagement depth
- completion-style metrics

### `trackAudioStart` and `trackAudioProgress`

Called for native `<audio>` elements inside the tracked root.

Behavior:

- start event once playback begins
- progress events at 10% intervals

Use this for:

- podcast or audio engagement
- narration tracking
- embedded audio analytics

### `trackVideoStart` and `trackVideoProgress`

Called for tracked videos inside the root.

Behavior:

- start event once playback begins
- progress events at 10% intervals

Use this for:

- video engagement
- completion funnels
- media consumption metrics

### `trackModalElement`

Called when a modal element in pagestrip content is opened or closed.

Behavior:

- `event` is "open" or "close", depending on the event that happened.
- `openMillis` is only available for "close" events and given in milliseconds.
- `openMillis` denotes the amount of the time the modal was open for.
- `modalName` can be configured in the pagestrip editor and is null if not set.

Use this for:

- engagement with modal elements
- content consumption metrics for content shown in modal elements

## About `root`

Every callback receives a `root: Element`.

Most trackers can ignore it.

Use it only if you need DOM context, for example:

- reading `data-*` attributes from the Pagestrip root
- inspecting nearby DOM state
- deriving project-specific metadata from the root element

If you do not need it, name it `_root` and ignore it.

## Implementation Advice

When filling in `tracker.ts`:

- Keep handler functions small.
- Forward data into your analytics SDK directly.
- Prefer stable event names.
- Prefer stable payload keys.
- Use `navigationState` to enrich audio, video, dwell, scroll, and outbound-click events with page metadata.
- Avoid expensive DOM work inside handlers.
- Avoid throwing exceptions.

The framework guards against exceptions in your handlers so one bad event does not break the whole tracker, but small and safe handlers are still best.

## Good Pattern

```ts
const tracker = new PSTracker({
  trackNavigation: (_root, event) => {
    window.dataLayer?.push({
      event: "ps_page_view",
      url: event.standardizedURL,
      title: event.title,
      contentType: event.contentType,
      language: event.language,
    });
  },

  trackScrollDepth: (_root, percent, nav) => {
    window.dataLayer?.push({
      event: "ps_scroll_depth",
      percent,
      url: nav.standardizedURL,
      title: nav.title,
    });
  },
});

tracker.start();
```

## Bad Pattern

Do not do framework work in `tracker.ts`:

- no changes to detection logic
- no changes to event timing
- no changes to feature semantics
- no edits in `src/`

Do not do project-specific integration work in `src/`:

- no publisher-specific IDs
- no site-specific endpoint URLs
- no one-off event naming for a single deployment
- no custom hacks that only make sense for one tracker

## Commands

Useful commands:

- `npm run build` bundles `tracker.ts` into `dist/tracker.js`
- `npm run typecheck` runs TypeScript checks
- `npm test` currently runs typecheck

If `tracker.ts` does not exist, `npm run build` will fail and tell you to copy `tracker.ts.example` first.

## If You Actually Want To Change The Framework

Only change `src/` if your goal is to improve the framework for everyone.

Framework changes should preserve the current structure:

- `src/lib.ts` owns lifecycle and calls user-supplied handlers
- feature files in `src/` own detection and observation
- feature files should emit event data upward instead of calling `_impl` directly
- listeners and guards must be cleaned up correctly on navigation changes

If you are only implementing a concrete tracker, stop before doing any of that.

## Final Reminder

If your task is "implement our analytics tracker", then your job is almost certainly:

- copy `tracker.ts.example` to `tracker.ts`
- remove unused handlers
- fill in the remaining handlers
- run `npm run build`

It is almost certainly not:

- editing `src/`
- refactoring the framework
- changing detection behavior
- adding new tracking primitives
