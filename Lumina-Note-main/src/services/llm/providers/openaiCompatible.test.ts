import { describe, expect, it } from "vitest";

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

class TestOpenAICompatibleProvider extends OpenAICompatibleProvider {
  parse(data: Record<string, unknown>) {
    return this.parseResponse(data);
  }
}

function createProvider(config: Partial<LLMConfig> = {}) {
  return new TestOpenAICompatibleProvider(
    {
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o",
      ...config,
    },
    {
      defaultBaseUrl: "https://api.openai.com/v1",
    },
  );
}

describe("OpenAICompatibleProvider.parseResponse", () => {
  it("parses valid tool call JSON arguments", () => {
    const provider = createProvider();
    const result = provider.parse({
      choices: [
        {
          message: {
            content: "ok",
            tool_calls: [
              {
                id: "call_1",
                function: {
                  name: "searchNotes",
                  arguments: '{"query":"rag","limit":5}',
                },
              },
            ],
          },
        },
      ],
    });

    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "searchNotes",
        arguments: { query: "rag", limit: 5 },
      },
    ]);
  });

  it("returns empty args for malformed tool call JSON instead of throwing", () => {
    const provider = createProvider();

    expect(() =>
      provider.parse({
        choices: [
          {
            message: {
              content: "ok",
              tool_calls: [
                {
                  id: "call_2",
                  function: {
                    name: "searchNotes",
                    arguments: "{bad-json",
                  },
                },
              ],
            },
          },
        ],
      }),
    ).not.toThrow();

    const result = provider.parse({
      choices: [
        {
          message: {
            content: "ok",
            tool_calls: [
              {
                id: "call_2",
                function: {
                  name: "searchNotes",
                  arguments: "{bad-json",
                },
              },
            ],
          },
        },
      ],
    });

    expect(result.toolCalls?.[0]?.arguments).toEqual({});
  });
});
