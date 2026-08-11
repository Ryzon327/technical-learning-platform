import { describe, expect, it } from "vitest";
import { createAuditEvent } from "./audit";

describe("audit foundation", () => {
  it("creates an immutable-shaped audit record", () => {
    const event = createAuditEvent({
      eventType: "auth.registration",
      outcome: "success",
      actorId: "user-1"
    });

    expect(event.eventType).toBe("auth.registration");
    expect(event.actorId).toBe("user-1");
    expect(event.eventId).toBeTruthy();
  });
});
