import { describe, expect, it } from "vitest";
import { InProcessEventBus } from "../src/events.js";

describe("InProcessEventBus", () => {
  it("delivers events to subscribers", async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe("conversation.message", (p) => {
      seen.push(p.content);
    });
    await bus.publish("conversation.message", {
      userId: "u1",
      sessionId: "s1",
      role: "user",
      content: "hej",
    });
    expect(seen).toEqual(["hej"]);
  });

  it("unsubscribe stops delivery", async () => {
    const bus = new InProcessEventBus();
    let count = 0;
    const unsub = bus.subscribe("reflection.completed", () => {
      count += 1;
    });
    await bus.publish("reflection.completed", {
      userId: "u1",
      sessionId: "s1",
      insights: [],
    });
    unsub();
    await bus.publish("reflection.completed", {
      userId: "u1",
      sessionId: "s1",
      insights: [],
    });
    expect(count).toBe(1);
  });

  it("isolates failing handlers", async () => {
    const errors: string[] = [];
    const bus = new InProcessEventBus((event) => errors.push(event));
    let delivered = false;
    bus.subscribe("coach.commitment", () => {
      throw new Error("handler failure");
    });
    bus.subscribe("coach.commitment", () => {
      delivered = true;
    });
    await bus.publish("coach.commitment", { userId: "u1", action: "run" });
    expect(delivered).toBe(true);
    expect(errors).toEqual(["coach.commitment"]);
  });
});
