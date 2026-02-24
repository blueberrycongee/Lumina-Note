import { describe, expect, it } from "vitest";

import {
  buildAgentExportMessages,
  buildChatExportMessages,
  buildConversationExportMarkdown,
  sanitizeExportFileName,
  type RawConversationMessage,
} from "./exportUtils";

describe("conversation export utils", () => {
  it("builds chat export messages from user/assistant only", () => {
    const input: RawConversationMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "User message" },
      { role: "assistant", content: "Assistant message" },
      { role: "tool", content: "tool output" },
    ];

    const messages = buildChatExportMessages(input);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("filters agent tool logs and keeps user/assistant text", () => {
    const input: RawConversationMessage[] = [
      { role: "user", content: "<task>请写一个总结</task>" },
      { role: "tool", content: '🔧 write: {"filePath":"a.md"}' },
      {
        role: "assistant",
        content: "<thinking>先分析</thinking><attempt_completion><result>这是最终回答</result></attempt_completion>",
      },
      { role: "assistant", content: "🔧 list: {}" },
    ];

    const messages = buildAgentExportMessages(input);

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("请写一个总结");
    expect(messages[1].content).toBe("这是最终回答");
  });

  it("builds markdown from selected messages", () => {
    const markdown = buildConversationExportMarkdown({
      title: "测试会话",
      modeLabel: "模式: Chat",
      roleLabels: {
        user: "用户",
        assistant: "AI",
      },
      messages: [
        { id: "1", role: "user", content: "A 段", order: 1 },
        { id: "2", role: "assistant", content: "B 段", order: 2 },
      ],
    });

    expect(markdown).toContain("# 测试会话");
    expect(markdown).toContain("## 用户");
    expect(markdown).toContain("A 段");
    expect(markdown).toContain("## AI");
    expect(markdown).toContain("B 段");
  });

  it("sanitizes export file name", () => {
    expect(sanitizeExportFileName("Agent: 测试/会话")).toBe("Agent-测试-会话");
    expect(sanitizeExportFileName("   ")).toBe("conversation");
  });
});
