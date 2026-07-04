import { describe, expect, it } from "vitest";
import { err, map, ok, tryAsync, unwrap } from "../src/result.js";

describe("Result", () => {
  it("ok carries value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(unwrap(r)).toBe(42);
  });

  it("err carries error and unwrap throws", () => {
    const r = err(new Error("boom"));
    expect(r.ok).toBe(false);
    expect(() => unwrap(r)).toThrow("boom");
  });

  it("map transforms only success", () => {
    expect(unwrap(map(ok(2), (n) => n * 2))).toBe(4);
    const failure = map(err<Error>(new Error("x")), (n: number) => n * 2);
    expect(failure.ok).toBe(false);
  });

  it("tryAsync captures rejections as Err", async () => {
    const good = await tryAsync(async () => "fine");
    expect(good).toEqual(ok("fine"));
    const bad = await tryAsync(async () => {
      throw new Error("nope");
    });
    expect(bad.ok).toBe(false);
  });
});
