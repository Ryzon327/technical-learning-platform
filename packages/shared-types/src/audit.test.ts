import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./audit";

describe("audit contract", () => {
  it("captures normalized audit outcome metadata", () => {
    const event: AuditEvent = {
      eventId: "event-1",
      occurredAt: new Date().toISOString(),
      eventType: "auth.sign_in",
      outcome: "success"
    };

    expect(event.outcome).toBe("success");
  });
});
