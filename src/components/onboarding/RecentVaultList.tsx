import { motion } from "framer-motion";
import { Folder, X } from "lucide-react";
import type { RecentVault } from "@/stores/useRecentVaultStore";

interface RecentVaultListProps {
  vaults: RecentVault[];
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.24, ease: [0.2, 0.9, 0.1, 1] },
  },
};

export function RecentVaultList({
  vaults,
  onSelect,
  onRemove,
  onClear,
}: RecentVaultListProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recent Vaults
      </div>

      {vaults.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-muted-foreground">
          <Folder className="w-8 h-8 mb-2 opacity-40" />
          <span className="text-sm">No recent vaults</span>
        </div>
      ) : (
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 overflow-y-auto px-2"
        >
          {vaults.map((vault) => (
            <motion.div
              key={vault.path}
              variants={itemVariants}
              className="group relative flex items-center gap-2 px-2 py-2 rounded-ui-md hover:bg-accent cursor-pointer transition-colors duration-100"
              onClick={() => onSelect(vault.path)}
            >
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">
                  {vault.name}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {vault.path}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(vault.path);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background transition-opacity duration-100"
                aria-label={`Remove ${vault.name}`}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {vaults.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}
