import { describe, expect, it } from "vitest";

import {
  buildImageModeAgentPrompt,
  isAgentConfigUsableForImageMode,
} from "./MainAIChatShell";

describe("isAgentConfigUsableForImageMode", () => {
  it("requires a key for hosted main-model providers", () => {
    expect(
      isAgentConfigUsableForImageMode({
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "",
      }),
    ).toBe(false);
    expect(
      isAgentConfigUsableForImageMode({
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "sk-test",
      }),
    ).toBe(true);
  });

  it("treats incomplete openai-compatible settings as not agent-usable", () => {
    expect(
      isAgentConfigUsableForImageMode({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      }),
    ).toBe(false);
    expect(
      isAgentConfigUsableForImageMode({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "kimi-k2.5",
        baseUrl: "",
        apiKey: "",
      }),
    ).toBe(false);
    expect(
      isAgentConfigUsableForImageMode({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "kimi-k2.5",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      }),
    ).toBe(true);
  });

  it("allows local Ollama without an API key", () => {
    expect(
      isAgentConfigUsableForImageMode({
        provider: "ollama",
        model: "llama3.2",
        apiKey: "",
      }),
    ).toBe(true);
  });
});

describe("buildImageModeAgentPrompt", () => {
  it("keeps image mode agent-assisted and pins the configured provider", () => {
    const prompt = buildImageModeAgentPrompt("画一个黑白头像", {
      id: "openai-image",
      marketingName: "gpt-image-2",
    });

    expect(prompt).toContain("Use the image-gen skill");
    expect(prompt).toContain("Refine the user's prompt");
    expect(prompt).toContain("Use only this provider");
    expect(prompt).toContain("Keep provider routing separate");
    expect(prompt).toContain("Preserve explicit visual constraints");
    expect(prompt).toContain("Handle visible text as its own requirement");
    expect(prompt).toContain("do not repeat the generated image as markdown");
    expect(prompt).toContain("`openai-image`");
    expect(prompt).toContain("画一个黑白头像");
  });
});
