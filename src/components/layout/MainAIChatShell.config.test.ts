import { describe, expect, it } from "vitest";

import {
  buildImageModeAgentPrompt,
  getAgentVisionModeForImageMode,
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

describe("getAgentVisionModeForImageMode", () => {
  it("detects known vision-capable agent models", () => {
    expect(
      getAgentVisionModeForImageMode({
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "sk-test",
      }),
    ).toBe("vision");
  });

  it("detects known text-only agent models as metadata-only", () => {
    expect(
      getAgentVisionModeForImageMode({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "sk-test",
      }),
    ).toBe("metadata-only");
    expect(
      getAgentVisionModeForImageMode({
        provider: "glm",
        model: "glm-5",
        apiKey: "sk-test",
      }),
    ).toBe("metadata-only");
  });

  it("resolves openai-compatible custom model ids through the catalog fallback", () => {
    expect(
      getAgentVisionModeForImageMode({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "kimi-k2.5",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      }),
    ).toBe("vision");
  });

  it("treats unknown custom model capabilities conservatively", () => {
    expect(
      getAgentVisionModeForImageMode({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "my-private-model",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      }),
    ).toBe("unknown");
  });
});

describe("buildImageModeAgentPrompt", () => {
  it("keeps image mode agent-assisted and pins the configured provider", () => {
    const prompt = buildImageModeAgentPrompt(
      "画一个黑白头像",
      {
        id: "openai-image",
        marketingName: "gpt-image-2",
      },
      "vision",
    );

    expect(prompt).toContain("Use the image-gen skill");
    expect(prompt).toContain("Refine the user's prompt");
    expect(prompt).toContain("Use only this provider");
    expect(prompt).toContain("Keep provider routing separate");
    expect(prompt).toContain("Preserve explicit visual constraints");
    expect(prompt).toContain("Handle visible text as its own requirement");
    expect(prompt).toContain("Agent vision capability for this request: enabled");
    expect(prompt).toContain("extract visual traits");
    expect(prompt).toContain("do not repeat the generated image as markdown");
    expect(prompt).toContain("`openai-image`");
    expect(prompt).toContain("画一个黑白头像");
  });

  it("tells text-only agents to use references without pretending to see them", () => {
    const prompt = buildImageModeAgentPrompt(
      "按之前那张赛博封面的风格再画一张",
      {
        id: "google-image",
        marketingName: "Nano Banana",
      },
      "metadata-only",
    );

    expect(prompt).toContain("Agent vision capability for this request: metadata-only");
    expect(prompt).toContain("generate_image will read the referenced image bytes");
    expect(prompt).toContain("Do not call read on image files to decide what they depict");
    expect(prompt).toContain("ask the user which reference to use instead of guessing");
  });
});
