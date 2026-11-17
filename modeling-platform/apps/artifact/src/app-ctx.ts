import type { SampleFn } from "./runtime";
import type { Store } from "./store";

export interface AppCtx {
  store: Store;
  toast: (text: string, tone?: "positive" | "negative" | "info") => void;
  /** Gem en fil via downloads-capabilityen (null-sikker). */
  download: (filename: string, data: string | Blob) => Promise<void>;
  canDownload: boolean;
  copy: (text: string, okMessage: string) => Promise<void>;
  sample: SampleFn | null;
  /** true når capability-opslaget er afsluttet (sample er så enten en funktion eller null). */
  capsReady: boolean;
}
