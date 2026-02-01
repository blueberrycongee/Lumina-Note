export interface AttachedImage {
  id: string;
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  preview: string;
}
