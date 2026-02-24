import type { MessageAttachment } from "@/services/llm";

const DIAGRAM_FILE_SUFFIXES = [".diagram.json", ".excalidraw.json", ".drawio.json"] as const;

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

export function isDiagramFilePath(candidate?: string): boolean {
  const normalized = (candidate || "").toLowerCase();
  return DIAGRAM_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function getDiagramAttachmentFilePaths(attachments: MessageAttachment[] = []): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addPath = (path?: string) => {
    if (!path) return;
    const normalized = path.trim();
    if (!normalized) return;
    const key = normalizePathKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  };

  attachments.forEach((attachment) => {
    if (attachment.type === "file") {
      if (!attachment.path) return;
      if (!isDiagramFilePath(attachment.path) && !isDiagramFilePath(attachment.name)) {
        return;
      }
      addPath(attachment.path);
      return;
    }

    const { sourcePath, source, range } = attachment;
    if (!sourcePath) return;
    if (range?.kind === "diagram" || isDiagramFilePath(sourcePath) || isDiagramFilePath(source)) {
      addPath(sourcePath);
    }
  });

  return result;
}
