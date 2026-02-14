import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Code2, FileText, Quote } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { ImageContent, MessageAttachment } from "@/services/llm";

const InlineDiagramView = lazy(async () => {
  const mod = await import("../diagram/DiagramView");
  return { default: mod.DiagramView };
});

const DIAGRAM_FILE_SUFFIXES = [".diagram.json", ".excalidraw.json", ".drawio.json"] as const;

function isDiagramFileAttachment(path?: string, name?: string): boolean {
  const candidate = (path || name || "").toLowerCase();
  return DIAGRAM_FILE_SUFFIXES.some((suffix) => candidate.endsWith(suffix));
}

function buildDiagramAttachmentKey(sourcePath: string, locator: string | undefined, index: number): string {
  return `${sourcePath}::${locator ?? ""}::${index}`;
}

interface UserMessageBubbleContentProps {
  text?: string;
  attachments?: MessageAttachment[];
  images?: ImageContent[];
  textClassName?: string;
  imageClassName?: string;
}

export function UserMessageBubbleContent({
  text = "",
  attachments = [],
  images = [],
  textClassName = "text-sm whitespace-pre-wrap",
  imageClassName = "max-w-[220px] max-h-[220px] rounded-lg",
}: UserMessageBubbleContentProps) {
  const { t } = useLocaleStore();
  const [openDiagramEditors, setOpenDiagramEditors] = useState<Record<string, boolean>>({});

  const attachedDiagramFiles = useMemo(
    () =>
      attachments
        .filter((attachment): attachment is Extract<MessageAttachment, { type: "file" }> => {
          if (attachment.type !== "file") return false;
          return isDiagramFileAttachment(attachment.path, attachment.name) && Boolean(attachment.path);
        })
        .map((attachment, attachmentIdx) => ({
          attachment,
          key: `${attachment.path ?? attachment.name}::${attachmentIdx}`,
        })),
    [attachments],
  );

  const diagramQuoteAttachments = useMemo(
    () =>
      attachments
        .map((attachment, attachmentIdx) => {
          if (attachment.type !== "quote") return null;
          if (attachment.range?.kind !== "diagram") return null;
          if (!attachment.sourcePath) return null;
          return {
            attachment,
            key: buildDiagramAttachmentKey(attachment.sourcePath, attachment.locator, attachmentIdx),
          };
        })
        .filter(
          (item): item is { attachment: Extract<MessageAttachment, { type: "quote" }>; key: string } =>
            Boolean(item),
        ),
    [attachments],
  );

  const toggleDiagramEditor = useCallback((key: string) => {
    setOpenDiagramEditors((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return (
    <>
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((attachment, attachmentIdx) => (
            <span
              key={`${attachment.type}-${attachmentIdx}-${attachment.type === "file" ? attachment.path ?? attachment.name : attachment.sourcePath ?? attachment.source}`}
              className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs"
            >
              {attachment.type === "file" ? (
                <>
                  <FileText size={10} />
                  <span className="max-w-[220px] truncate">{attachment.name}</span>
                </>
              ) : (
                <>
                  <Quote size={10} />
                  <span className="max-w-[240px] truncate">
                    {attachment.source}
                    {attachment.locator ? ` (${attachment.locator})` : ""}
                  </span>
                  {attachment.range?.kind === "diagram" && attachment.sourcePath ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const key = buildDiagramAttachmentKey(
                          attachment.sourcePath!,
                          attachment.locator,
                          attachmentIdx,
                        );
                        toggleDiagramEditor(key);
                      }}
                      className="ml-0.5 inline-flex items-center rounded-full border border-border/50 p-0.5 hover:bg-muted"
                      title={
                        openDiagramEditors[
                          buildDiagramAttachmentKey(
                            attachment.sourcePath!,
                            attachment.locator,
                            attachmentIdx,
                          )
                        ]
                          ? t.diagramView.closeInteractive
                          : t.diagramView.openInteractive
                      }
                      aria-label={
                        openDiagramEditors[
                          buildDiagramAttachmentKey(
                            attachment.sourcePath!,
                            attachment.locator,
                            attachmentIdx,
                          )
                        ]
                          ? t.diagramView.closeInteractive
                          : t.diagramView.openInteractive
                      }
                    >
                      <Code2 size={10} />
                    </button>
                  ) : null}
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {attachedDiagramFiles.length > 0 && (
        <div className="mb-2 space-y-2">
          {attachedDiagramFiles.map(({ attachment, key }) => (
            <div
              key={key}
              className="overflow-hidden rounded-ui-lg border border-border/60 bg-background/70"
            >
              <div className="border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
                {t.diagramView.inlineEditorTitle}
              </div>
              <div className="h-[360px] min-h-[260px]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {t.diagramView.loadingEditor}
                    </div>
                  }
                >
                  <InlineDiagramView
                    filePath={attachment.path || ""}
                    className="h-full"
                    saveMode="manual"
                    showSendToChatButton={false}
                  />
                </Suspense>
              </div>
            </div>
          ))}
        </div>
      )}

      {diagramQuoteAttachments.length > 0 && (
        <div className="mb-2 space-y-2">
          {diagramQuoteAttachments
            .filter(({ key }) => openDiagramEditors[key])
            .map(({ attachment, key }) => (
              <div
                key={key}
                className="overflow-hidden rounded-ui-lg border border-border/60 bg-background/70"
              >
                <div className="border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
                  {t.diagramView.inlineEditorTitle}
                </div>
                <div className="h-[360px] min-h-[260px]">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {t.diagramView.loadingEditor}
                      </div>
                    }
                  >
                    <InlineDiagramView
                      filePath={attachment.sourcePath || ""}
                      className="h-full"
                      saveMode="manual"
                      showSendToChatButton={false}
                    />
                  </Suspense>
                </div>
              </div>
            ))}
        </div>
      )}

      {text && <span className={textClassName}>{text}</span>}
      {images.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${text || attachments.length > 0 ? "mt-2" : ""}`}>
          {images.map((img, imageIdx) => (
            <img
              key={`${img.source.data.slice(0, 16)}-${imageIdx}`}
              src={`data:${img.source.mediaType};base64,${img.source.data}`}
              alt="attached"
              className={imageClassName}
            />
          ))}
        </div>
      )}
    </>
  );
}
