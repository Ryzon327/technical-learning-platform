import { describe, expect, it } from "vitest";
import {
  chooseLabProvider,
  getLabProvider,
  listRegisteredLabProviders
} from "./lab-provider-registry";

describe("lab provider registry", () => {
  it("registers mock and container providers", () => {
    expect(
      listRegisteredLabProviders().map(
        (registration) => registration.providerId
      )
    ).toEqual(expect.arrayContaining(["mock", "container"]));
  });

  it("resolves the container provider", async () => {
    const capabilities = await getLabProvider(
      "container"
    ).getCapabilities();

    expect(capabilities.providerId).toBe("container");
  });

  it("chooses an enabled healthy provider when no extra capabilities are required", async () => {
    const selection = await chooseLabProvider([], "test-user");

    const capabilities = await selection.provider.getCapabilities();

    expect(selection.providerId).toBe("mock");
    expect(capabilities.providerId).toBe("mock");
  });
});
