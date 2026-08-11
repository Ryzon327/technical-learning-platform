import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { AppError } from "@tlp/shared-types";
import { extractBearerToken } from "./auth-context";

function requestWithAuthorization(
  authorization?: string
): IncomingMessage {
  return {
    headers: authorization ? { authorization } : {}
  } as IncomingMessage;
}

describe("protected request identity", () => {
  it("extracts a bearer token", () => {
    expect(
      extractBearerToken(requestWithAuthorization("Bearer token-123"))
    ).toBe("token-123");
  });

  it("rejects a request without bearer authentication", () => {
    expect(() =>
      extractBearerToken(requestWithAuthorization())
    ).toThrow(AppError);
  });

  it("rejects malformed authorization", () => {
    expect(() =>
      extractBearerToken(requestWithAuthorization("Basic abc"))
    ).toThrow("Authentication required");
  });
});
