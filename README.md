# pagestrip Custom Tracking Template

A small TypeScript framework for integrating custom analytics tracking into pagestrip-powered content.

The main idea is simple:

- copy `tracker.ts.example` to `tracker.ts`
- implement the tracking callbacks you need
- build a browser bundle

If you only want to integrate your own analytics system, you should work in `tracker.ts` and leave `src/` alone.

## How It Works

This project separates two concerns:

1. The framework in `src/`
2. Your tracker implementation in `tracker.ts`

Most users only need the second one.

`tracker.ts` is gitignored on purpose. It is your local integration file where you connect pagestrip events to your analytics platform.

## Quick Start

1. Copy the example file:

   ```bash
   cp tracker.ts.example tracker.ts
   ```

2. Open `tracker.ts`
3. Remove the handlers you do not need
4. Replace the example `console.log(...)` calls with your analytics SDK calls
5. Build:

   ```bash
   npm run build
   ```

The output bundle will be written to `dist/tracker.js`.

Load this file on the page where you place your pagestrip embed.

You can defer the call to `start()` by binding it to another event: For
example, you may want to wait until a user has chosen consent in your consent
manager.

## The Files You Probably Need

If you are implementing a concrete tracker, focus on:

- `tracker.ts.example`
- `tracker.ts`
- `src/types.ts`

If you are not intentionally changing the framework, you usually do **not** need to edit anything in the `/src` directory.

## Minimal Example

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

For most integrations:

- `tracker.start()` without arguments is correct
- the default `.pagestrip-root` selector is correct
- removing unused handlers is enough

## Available Hooks

The framework supports these optional callbacks:

- `trackNavigation(root, event)`
- `trackExternalLink(root, url, navigationState)`
- `trackDwell(root, seconds, navigationState)`
- `trackScrollDepth(root, percent, navigationState)`
- `trackAudioStart(root, audioId, navigationState)`
- `trackAudioProgress(root, audioId, percent, navigationState)`
- `trackVideoStart(root, videoId, navigationState)`
- `trackVideoProgress(root, videoId, percent, navigationState)`

See `src/types.ts` for the exact TypeScript signatures.

## What The Hooks Mean

### `trackNavigation`

Called when Pagestrip navigates to a new content item.

Typical use:

- page views
- content views
- screen view events

### `trackExternalLink`

Called when a user clicks an outbound link inside the tracked root.

Behavior:

- different subdomains count as external
- `www.example.com` and `example.com` are treated as the same host
- `mailto:`, `tel:`, and custom schemes count as external
- `javascript:` links are ignored

### `trackDwell`

Called every 5 seconds while the tracked content is visible.

Useful for:

- engaged time
- active reading time
- time-on-content metrics

### `trackScrollDepth`

Called in 10% steps from `10` to `100`.

Behavior:

- the first viewport worth of content counts as `0%`
- `100%` is reached slightly before the true bottom
- short content can report `100%` immediately when visible
- percentages are never reported twice during one navigation cycle

### `trackAudioStart` / `trackAudioProgress`

Called for native `<audio>` elements inside the tracked root.

Behavior:

- start event once playback begins
- progress events at 10% intervals

### `trackVideoStart` / `trackVideoProgress`

Called for tracked videos inside the root.

Behavior:

- start event once playback begins
- progress events at 10% intervals

### `trackModalElement`

Called when a modal element in pagestrip content is opened or closed.

Behavior:

- event is either "open" or "close"
- `openMillis` is only set for the "close" event, denoting open time in ms.
- `modalName` can be configured in the pagestrip editor and is null if not set.

## Disabling Features

The normal way to disable a feature is simply to remove its handler.

For example:

- remove `trackDwell` if you do not want dwell tracking
- remove `trackScrollDepth` if you do not want scroll tracking
- remove `trackAudioStart` and `trackAudioProgress` if you do not care about audio

You can also disable framework observers via `start(...)` options if you need to:

```ts
tracker.start({
  trackDwell: false,
  trackScrollDepth: false,
});
```

Most users do not need this.

## Example Pattern

```ts
import { PSTracker } from "./src/lib";

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

## Commands

```bash
npm install
npm run typecheck
npm run build
```

### `npm run build`

Bundles `tracker.ts` into `dist/tracker.js`.

If `tracker.ts` does not exist, the build will fail and tell you to copy `tracker.ts.example` first.

### `npm run typecheck`

Runs TypeScript checks.

## When Should I Change `src/`?

Only change `src/` if you want to modify the framework itself.

Examples of framework work:

- changing how events are detected
- adding a new tracking primitive
- changing timing or semantics of existing events
- adding support for specific events within your personal pagestrip content

If your task is "implement our analytics tracker", you almost certainly do **not** want to edit `src/`.

## Summary

If you are integrating your own analytics system, the workflow is usually just:

1. copy `tracker.ts.example` to `tracker.ts`
2. remove unused handlers
3. implement the remaining handlers
4. run `npm run build`
5. load the script on the page(s) where you embed pagestrip content

That is the intended use of this project.

## FAQ

### Do I need to worry about timing, e.g. loading the tracker adapter before/after my pagestrip content renders?

No, in the default configuration, `autoAttach: true` is set, which means that
embeds that are already loaded or will be loaded later are discovered 
automatically, so you don't need to do anything.

### How do I clean up the tracker?

You can explicitly call `.stop()` on the tracker to turn it off, but usually
this won't even be necessary: If a pagestrip embed is detached from the DOM,
the tracker will automatically unregister it. If the tracker is loaded via a
script tag with `src`, the tracker will clean up completely automatically once
this script tag is detached from the DOM, too. This is useful if your host site
uses SPA-style navigation without full page reloads: In this case, just make
sure that the tracker script is only present on the pages where you have a
pagestrip embed, and it will automatically clean itself up for you when it is
currently not needed.

### Does the tracker track anything else besides what happens in the pagestrip embed?

No. The tracker only reacts to events within pagestrip content and will not be
triggered by other events, such as SPA-style page navigation in your host site.

### Can I use my own consent manager?

Yes, of course. Since you implement the actual reactions to tracking events
yourself, you can either tie these to consent (such as just writing them into a
data layer and have the consent manager decide whether to actually send them or
not), or by explicitly calling `.start()` or `.stop()` if you want to manage
this manually via your implementation.

### Do I need to watch this repository and update my implementation when you change things?

No. While we'll possibly add additional events, fixes, or improvements over
time, we'll always keep the internally used APIs stable, so your version will
never cease working.
