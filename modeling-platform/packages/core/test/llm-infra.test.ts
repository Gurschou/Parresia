import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/llm/rate-limiter";
import { backoffDelay, withRetry } from "../src/llm/retry";
import { coerceToSchema, extractJson } from "../src/analyzer/coerce";
import { countVakogPredicates } from "../src/insights/vakog-lexicon";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("RateLimiter", () => {
  it("overholder max samtidighed", async () => {
    const rl = new RateLimiter({ maxConcurrent: 2, maxRequests: 100 });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        rl.schedule(async () => {
          active++;
          peak = Math.max(peak, active);
          await wait(15);
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it("overholder antal kald pr. vindue", async () => {
    const rl = new RateLimiter({ maxConcurrent: 10, maxRequests: 2, windowMs: 120 });
    const starts: number[] = [];
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 4 }, () => rl.schedule(async () => void starts.push(Date.now() - t0))));
    starts.sort((a, b) => a - b);
    expect(starts[1]!).toBeLessThan(60);
    expect(starts[2]!).toBeGreaterThanOrEqual(110);
  });

  it("fjerner ventende kald ved abort", async () => {
    const rl = new RateLimiter({ maxConcurrent: 1, maxRequests: 100 });
    const blocker = rl.schedule(() => wait(60));
    const ctrl = new AbortController();
    const queued = rl.schedule(async () => "ran", ctrl.signal);
    expect(rl.pending).toBe(1);
    ctrl.abort();
    await expect(queued).rejects.toBeDefined();
    expect(rl.pending).toBe(0);
    await blocker;
  });
});

describe("withRetry", () => {
  it("bruger eksponentiel backoff med jitter inden for grænser", () => {
    expect(backoffDelay(0, 1000, 60000, () => 0)).toBe(500);
    expect(backoffDelay(3, 1000, 60000, () => 1)).toBe(8000);
    expect(backoffDelay(10, 1000, 5000, () => 1)).toBe(5000);
  });

  it("forsøger igen kun når shouldRetry siger ja", async () => {
    let n = 0;
    const delays: number[] = [];
    const out = await withRetry(
      async () => {
        if (++n < 3) throw new Error("tmp");
        return "ok";
      },
      { retries: 5, shouldRetry: () => true, sleep: async (ms) => void delays.push(ms), random: () => 0 },
    );
    expect(out).toBe("ok");
    expect(delays).toEqual([1000, 2000]);
    await expect(withRetry(async () => Promise.reject(new Error("fatal")), { retries: 5, shouldRetry: () => false })).rejects.toThrow("fatal");
  });
});

describe("coerceToSchema / extractJson", () => {
  const schema = {
    type: "object",
    properties: {
      level: { type: "string", enum: ["low", "high"] },
      score: { type: "number", minimum: 0, maximum: 10 },
      rank: { type: "integer", minimum: 0 },
      tags: { type: "array", items: { type: "string" } },
      note: { type: "string" },
    },
    required: ["level", "score", "rank", "tags", "note"],
  };
  it("retter casing, clamper tal, runder heltal og udfylder tomme felter", () => {
    const { value, fixes } = coerceToSchema({ level: "HIGH", score: "11", rank: 2.6 }, schema);
    expect(value).toEqual({ level: "high", score: 10, rank: 3, tags: [], note: "" });
    expect(fixes.length).toBe(4);
  });
  it("finder JSON i markdown-hegn og tekst", () => {
    expect(extractJson('Her:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('svar: {"a":2} slut')).toEqual({ a: 2 });
    expect(() => extractJson("ingenting")).toThrow();
  });
});

describe("VAKOG-leksikon", () => {
  it("tæller danske og engelske prædikater", () => {
    const r = countVakogPredicates("Jeg ser det tydeligt for mig. Det føles rigtigt i maven. I hear what you say and I think it makes sense.");
    expect(r.counts.V).toBeGreaterThanOrEqual(2);
    expect(r.counts.K).toBeGreaterThanOrEqual(1);
    expect(r.counts.A).toBeGreaterThanOrEqual(1);
    expect(r.counts.Ad).toBeGreaterThanOrEqual(1);
    const sum = Object.values(r.distribution).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 0);
  });
  it("giver nul-fordeling for tekst uden prædikater", () => {
    expect(countVakogPredicates("123 456").total).toBe(0);
  });
});
