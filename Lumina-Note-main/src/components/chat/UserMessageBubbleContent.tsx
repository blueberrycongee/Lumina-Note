import { FileText, Quote } from "lucide-react";
import type { ImageContent, MessageAttachment } from "@/services/llm";

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
                </>
              )}
            </span>
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
