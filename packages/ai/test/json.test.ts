import { describe, expect, it } from "vitest";
import { unwrap } from "@synapse/shared";
import { parseModelJson } from "../src/json.js";

describe("parseModelJson", () => {
  it("parses clean JSON", () => {
    expect(unwrap(parseModelJson<{ a: number }>('{"a":1}'))).toEqual({ a: 1 });
  });

  it("strips code fences", () => {
    expect(
      unwrap(parseModelJson<{ a: number }>('```json\n{"a":1}\n```')),
    ).toEqual({ a: 1 });
  });

  it("extracts JSON embedded in prose", () => {
    expect(
      unwrap(
        parseModelJson<{ a: number }>('Here is the analysis: {"a":1} — done.'),
      ),
    ).toEqual({ a: 1 });
  });

  it("returns a typed error for garbage", () => {
    const result = parseModelJson("not json at all");
    expect(result.ok).toBe(false);
  });
});
