import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFileStore } from "@/stores/useFileStore";

interface RawSourceImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (filePath: string) => void;
}

type ImportMode = "url" | "file" | "paste";

export function RawSourceImporter({
  isOpen,
  onClose,
  onImported,
}: RawSourceImporterProps) {
  const vaultPath = useFileStore((s) => s.vaultPath);
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [tags, setTags] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImportUrl = useCallback(async () => {
    if (!vaultPath || !url.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      const result = await invoke<{ file_path: string }>("vault_import_url", {
        workspacePath: vaultPath,
        url: url.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onImported?.(result.file_path);
      setUrl("");
      setTags("");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsImporting(false);
    }
  }, [vaultPath, url, tags, onClose, onImported]);

  const handlePaste = useCallback(async () => {
    if (!vaultPath || !pasteContent.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      const result = await invoke<{ file_path: string }>("vault_import_paste", {
        workspacePath: vaultPath,
        title: pasteTitle.trim() || "Untitled",
        content: pasteContent.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onImported?.(result.file_path);
      setPasteContent("");
      setPasteTitle("");
      setTags("");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsImporting(false);
    }
  }, [vaultPath, pasteContent, pasteTitle, tags, onClose, onImported]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background border border-border shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Import Raw Source</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg">
          {(["url", "paste"] as ImportMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "url" ? "URL" : "Paste"}
            </button>
          ))}
        </div>

        {mode === "url" && (
          <div className="space-y-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {mode === "paste" && (
          <div className="space-y-3">
            <input
              type="text"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Title"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Paste content here..."
              rows={8}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        <div className="mt-3">
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={mode === "url" ? handleImportUrl : handlePaste}
            disabled={
              isImporting ||
              (mode === "url" && !url.trim()) ||
              (mode === "paste" && !pasteContent.trim())
            }
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isImporting ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
