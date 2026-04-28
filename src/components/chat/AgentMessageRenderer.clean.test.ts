import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentMessageRenderer,
  cleanUserMessage,
  getImageGenerationProviderLabel,
  isPendingImageGenerationTool,
  makeGeneratedImageMarker,
  makeImageGeneratingMarker,
  parseGeneratedImageMarker,
  parseImageGeneratingMarker,
} from "./AgentMessageRenderer";

describe("AgentMessageRenderer", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("hides the image-mode agent wrapper from user-facing chat bubbles", () => {
    const content = [
      "Use the image-gen skill to generate an image.",
      "Use the configured image provider `openai-image` (gpt-image-2) unless the user explicitly asks for another configured provider.",
      "Refine the user's prompt for visual clarity, infer the aspect ratio, use relevant vault reference images when useful, then call generate_image.",
      "User prompt:",
      "黑白漫画风格头像",
    ].join("\n");

    expect(cleanUserMessage(content)).toBe("黑白漫画风格头像");
  });

  it("hides the stricter image-mode provider wrapper", () => {
    const content = [
      "Use the image-gen skill to generate an image.",
      "The configured image provider available for this request is `openai-image` (gpt-image-2). Use only this provider. Do not switch to Google, Seedream, ByteDance, or any other provider unless Lumina explicitly lists it as configured.",
      "Keep provider routing separate from prompt interpretation: the language the user typed in is not by itself a reason to switch providers.",
      "Preserve explicit visual constraints from the user, including medium, region, era, genre, culture, composition, subject, mood, palette, and style descriptors. Do not replace a specific descriptor with a nearby default style unless the user asked for that.",
      "Handle visible text as its own requirement: if the user asks for readable text, preserve the requested text and language; if they do not ask for readable text, ask the image model to avoid readable text, letters, captions, labels, and speech bubbles.",
      "Refine the user's prompt for visual clarity, infer the aspect ratio, use relevant vault reference images when useful, then call generate_image.",
      "User prompt:",
      "中文漫画风格",
    ].join("\n");

    expect(cleanUserMessage(content)).toBe("中文漫画风格");
  });

  it("hides the legacy one-line image-mode wrapper", () => {
    expect(
      cleanUserMessage(
        "Use the image-gen skill to generate an image. User prompt:\n黑白头像",
      ),
    ).toBe("黑白头像");
  });

  it("round-trips the direct image generation marker", () => {
    expect(parseImageGeneratingMarker(makeImageGeneratingMarker("gpt-image-2"))).toBe(
      "gpt-image-2",
    );
    expect(parseImageGeneratingMarker("plain text")).toBeNull();
  });

  it("round-trips the generated image marker", () => {
    const image = {
      absolutePath: "/vault/assets/generated/260428/icon.png",
      relativePath: "assets/generated/260428/icon.png",
      provider: "openai-image",
      providerLabel: "gpt-image-2",
      model: "gpt-image-2",
      markdown: "![](assets/generated/260428/icon.png)",
    };

    expect(parseGeneratedImageMarker(makeGeneratedImageMarker(image))).toEqual(image);
    expect(parseGeneratedImageMarker("plain text")).toBeNull();
  });

  it("detects pending image-generation tools and extracts the provider label", () => {
    const tool = {
      name: "generate_image",
      params: "",
      title: "Generating with gpt-image-2…",
    };

    expect(isPendingImageGenerationTool(tool)).toBe(true);
    expect(getImageGenerationProviderLabel(tool)).toBe("gpt-image-2");
  });

  it("keeps pending image generation after the work session summary", () => {
    const { container } = render(
      createElement(AgentMessageRenderer, {
        isRunning: true,
        messages: [
          {
            id: "msg-user",
            role: "user",
            content: "Create a square cover",
            rawParts: [],
          },
          {
            id: "msg-assistant",
            role: "assistant",
            content: "",
            rawParts: [
              {
                id: "part-tool",
                sessionID: "test-session",
                messageID: "msg-assistant",
                type: "tool",
                tool: "generate_image",
                state: {
                  status: "running",
                  title: "Generating with gpt-image-2…",
                  input: { prompt: "Create a square cover" },
                  time: { start: Date.now() - 1000 },
                },
              } as never,
            ],
          },
        ],
      }),
    );

    const progress = container.querySelector(".image-generation-progress");
    expect(progress).not.toBeNull();

    const workSummary = screen.getByRole("button", { name: /正在工作中/ });
    expect(
      workSummary.compareDocumentPosition(progress as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("copies visible user prompt and assistant reply text", async () => {
    render(
      createElement(AgentMessageRenderer, {
        isRunning: false,
        messages: [
          {
            id: "msg-user",
            role: "user",
            content: "Visible prompt",
            rawParts: [],
          },
          {
            id: "msg-assistant",
            role: "assistant",
            content: "Assistant reply",
            rawParts: [
              {
                id: "part-text",
                sessionID: "test-session",
                messageID: "msg-assistant",
                type: "text",
                text: "Assistant reply",
              } as never,
            ],
          },
        ],
      }),
    );

    const copyButtons = screen.getAllByRole("button", { name: "复制" });
    expect(copyButtons).toHaveLength(2);

    fireEvent.click(copyButtons[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Visible prompt"));

    fireEvent.click(copyButtons[1]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Assistant reply"));
  });
});
