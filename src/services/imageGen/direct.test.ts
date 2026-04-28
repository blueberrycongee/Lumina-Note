import { describe, expect, it } from "vitest";

import { FALLBACK_IMAGE_PROVIDERS } from "./types";
import { pickConfiguredImageProvider } from "./direct";

describe("pickConfiguredImageProvider", () => {
  it("prefers the configured OpenAI image provider before Google", () => {
    const providers = FALLBACK_IMAGE_PROVIDERS.map((provider) => ({
      ...provider,
      configured:
        provider.id === "openai-image" || provider.id === "google-image",
    }));

    expect(pickConfiguredImageProvider(providers)?.id).toBe("openai-image");
  });
});
