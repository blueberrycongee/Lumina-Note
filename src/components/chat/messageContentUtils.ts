import type { FileAttachment, ImageContent, MessageAttachment, MessageContent, TextContent } from "@/services/llm";

const LEGACY_FILE_LABEL_REGEX = /\[📎\s*([^\]]+)\]/g;

function dedupeAttachments(attachments: MessageAttachment[]): MessageAttachment[] {
  const seen = new Set<string>();
  const result: MessageAttachment[] = [];
  for (const attachment of attachments) {
    const key = attachment.type === "file"
      ? `file::${attachment.path ?? ""}::${attachment.name}`
      : `quote::${attachment.sourcePath ?? ""}::${attachment.source}::${attachment.locator ?? ""}::${attachment.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attachment);
  }
  return result;
}

export function getTextFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

export function getImagesFromContent(content: MessageContent): ImageContent[] {
  if (typeof content === "string") {
    return [];
  }

  return content.filter((item): item is ImageContent => item.type === "image");
}

export function getUserMessageDisplay(
  content: MessageContent,
  attachments: MessageAttachment[] = [],
): { text: string; attachments: MessageAttachment[] } {
  const rawText = getTextFromContent(content);
  const legacyAttachments: FileAttachment[] = [];

  const text = rawText
    .replace(LEGACY_FILE_LABEL_REGEX, (_, fileName: string) => {
      legacyAttachments.push({
        type: "file",
        name: fileName.trim(),
      });
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return {
    text,
    attachments: dedupeAttachments([...attachments, ...legacyAttachments]),
  };
}
