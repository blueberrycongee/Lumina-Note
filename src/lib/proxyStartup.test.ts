import { afterEach, describe, expect, it, vi } from "vitest";

import { hydrateProxyConfigOnStartup } from "./proxyStartup";

describe("hydrateProxyConfigOnStartup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pushes persisted proxy config to Rust when startup state has a proxy URL", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    await hydrateProxyConfigOnStartup(
      {
        proxyUrl: "http://127.0.0.1:7890",
        proxyEnabled: false,
      },
      invoke,
    );

    expect(invoke).toHaveBeenCalledWith("set_proxy_config", {
      proxyUrl: "http://127.0.0.1:7890",
      enabled: false,
    });
  });

  it("skips startup hydration when proxy config is still at its default state", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    await hydrateProxyConfigOnStartup(
      {
        proxyUrl: "",
        proxyEnabled: false,
      },
      invoke,
    );

    expect(invoke).not.toHaveBeenCalled();
  });
});
