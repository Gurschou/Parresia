/**
 * @bm/core — offentlig API (isomorf: ingen Node-only imports her).
 * Node-only moduler: `@bm/core/media`, `@bm/core/transcription`, `@bm/core/pdf`.
 */
export * from "./categories/registry";
export * from "./categories/types";
export { META_PROGRAMS, META_PROGRAM_IDS, metaProgramPoleLabel, CONVINCER_CHANNEL_LABEL, CONVINCER_MODE_LABEL } from "./categories/meta-programs";
export type { MetaProgramId } from "./categories/meta-programs";
export { BELIEF_TYPE_LABEL } from "./categories/beliefs";
export { STRATEGY_TYPE_LABEL } from "./categories/cognitive-strategies";
export { EYE_BASIS_LABEL, EYE_DIRECTION_LABEL, EYE_ACCESS_LABEL } from "./categories/eye-accessing-cues";
export { normalizeDistribution } from "./categories/vakog";
export type { VakogDistribution } from "./categories/vakog";
export * from "./schema/common";
export * from "./schema/labels";
export { SYSTEM_PROMPT } from "./prompt/system-prompt";
export { buildUserMessage } from "./prompt/build-user-message";
export type { AnalysisContext } from "./prompt/build-user-message";
export * from "./analyzer/analyze";
export * from "./analyzer/errors";
export { coerceToSchema, extractJson } from "./analyzer/coerce";
export { loadConfig } from "./config";
export type { CoreConfig, Effort, LlmProviderName, StructuredMode } from "./config";
export { RateLimiter } from "./llm/rate-limiter";
export { withRetry, backoffDelay, sleep } from "./llm/retry";
export { AnthropicLlmClient } from "./llm/anthropic";
export { MockLlmClient } from "./llm/mock";
export type { LlmClient, LlmRequest, LlmResponse } from "./llm/types";
export { countVakogPredicates } from "./insights/vakog-lexicon";
export type { LexiconCounts } from "./insights/vakog-lexicon";
export * from "./report/blocks";
export { buildReport } from "./report/build";
export type { ReportInfo } from "./report/build";
export { renderMarkdown } from "./report/markdown";
export { normalizeTranscriptFile, isTextTranscriptFile, TEXT_EXTENSIONS } from "./transcription/text-formats";
export { SAMPLE_TRANSCRIPT } from "./testing/sample-transcript";
export { aggregateDashboard } from "./insights/aggregate";
export type { AnalysisRecord, DashboardData } from "./insights/aggregate";
export { compareAnalyses } from "./insights/compare";
export type { ComparisonData, ComparisonColumn } from "./insights/compare";
export { suggestPatterns } from "./insights/patterns";
export type { PatternSuggestion, PatternOccurrence } from "./insights/patterns";
export { similarity, normalizeKey } from "./insights/text-similarity";
