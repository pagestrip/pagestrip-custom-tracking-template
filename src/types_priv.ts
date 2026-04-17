import type {
  TPSNavigationEvent,
  TTrackerOptions
} from "./types";

type TMediaState = {
  duration: number,
  pct: number;
  reportId: string;
}

export type TObservedRootInfo = {
  lastTimestamp: number;
  lastNavEvent: TPSNavigationEvent | null;
  navDisposers: (() => void)[];
  afterNavTimeout: ReturnType<typeof setTimeout> | undefined | null;
  afterNavTasks: (() => void)[];
  active: boolean;
  audios: Map<string, TMediaState>;
  videos: Map<string, TMediaState>;
  options: TTrackerOptions;
  listener: (event: CustomEvent<TPSNavigationEvent>) => void;
}
