/**
 * Server-side composition root for the web app.
 *
 * One SYNAPSE instance per server process (survives Next.js HMR via
 * globalThis). Uses file-backed stores under ./data for local development;
 * production swaps these for database adapters without touching engines.
 */
import { join } from "node:path";
import { InProcessEventBus } from "@synapse/shared";
import { createModelRouter } from "@synapse/ai";
import { FileMemoryStore, MemoryEngine } from "@synapse/memory";
import { SynapseOrchestrator } from "@synapse/agents";
import { FilePatternRepository } from "./file-pattern-repository.js";
import { createDemoRouter } from "./demo.js";

export interface SynapseRuntime {
  orchestrator: SynapseOrchestrator;
  memory: MemoryEngine;
  patterns: FilePatternRepository;
}

const globalStore = globalThis as unknown as { __synapse?: SynapseRuntime };

export function getSynapse(): SynapseRuntime {
  if (globalStore.__synapse) return globalStore.__synapse;
  const dataDir = join(process.cwd(), "data");
  const events = new InProcessEventBus((event, error) =>
    console.error(`[synapse] event handler failed for ${event}:`, error),
  );
  const router =
    process.env.SYNAPSE_DEMO === "1" ? createDemoRouter() : createModelRouter();
  const memory = new MemoryEngine(new FileMemoryStore(dataDir), events);
  const patterns = new FilePatternRepository(dataDir);
  const orchestrator = new SynapseOrchestrator({
    router,
    memory,
    patternRepository: patterns,
    events,
  });
  globalStore.__synapse = { orchestrator, memory, patterns };
  return globalStore.__synapse;
}

/** Single-user mode until authentication lands (see docs/Architecture.md). */
export const DEFAULT_USER_ID = "default";
