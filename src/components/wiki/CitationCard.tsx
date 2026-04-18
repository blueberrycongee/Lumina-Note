import { useFileStore } from "@/stores/useFileStore";

interface CitationCardProps {
  pagePath: string;
  section?: string;
  quote?: string;
}

/**
 * Renders a citation to a wiki page as a clickable card.
 * When clicked, opens the referenced wiki page in the editor.
 */
export function CitationCard({ pagePath, section }: CitationCardProps) {
  const openFile = useFileStore((s) => s.openFile);

  const handleClick = () => {
    // Resolve relative path against vault
    const vaultPath = useFileStore.getState().vaultPath;
    if (vaultPath) {
      const fullPath = `${vaultPath}/${pagePath}`;
      openFile(fullPath);
    }
  };

  const displayPath = pagePath.replace(/^wiki\//, "").replace(/\.md$/, "");

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors max-w-full"
      title={`Open ${pagePath}`}
    >
      <span className="shrink-0">📄</span>
      <span className="truncate font-medium">{displayPath}</span>
      {section && (
        <span className="text-muted-foreground truncate">#{section}</span>
      )}
    </button>
  );
}
