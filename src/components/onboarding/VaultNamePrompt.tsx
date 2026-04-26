import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VaultNamePromptProps {
  isOpen: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function VaultNamePrompt({
  isOpen,
  onSubmit,
  onCancel,
}: VaultNamePromptProps) {
  const [name, setName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setName("");
    }
  };

  const handleCancel = () => {
    setName("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm p-6 rounded-ui-xl bg-popover border border-border shadow-elev-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-ui-md bg-accent flex items-center justify-center">
            <FolderPlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Create New Vault
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter a name for your new vault
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Notes"
            className="w-full h-10 px-3 rounded-ui-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary mb-4"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={!name.trim()}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
