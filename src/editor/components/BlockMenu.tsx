import { useEffect, useRef, useCallback } from "react";

export type BlockMenuMode = "combined" | "insert";
export type BlockActionId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "callout"
  | "mathBlock"
  | "table"
  | "divider"
  | "image"
  | "link"
  | "delete"
  | "duplicate"
  | "insertBefore"
  | "insertAfter";

interface BlockMenuProps {
  mode: BlockMenuMode;
  position: { x: number; y: number };
  onAction: (actionId: BlockActionId) => void;
  onClose: () => void;
  activeType?: string;
}

interface MenuGroup {
  label: string;
  items: { id: BlockActionId; label: string; title: string }[];
}

const FORMAT_GROUPS: MenuGroup[] = [
  {
    label: "Heading",
    items: [
      { id: "heading1", label: "H1", title: "Heading 1" },
      { id: "heading2", label: "H2", title: "Heading 2" },
      { id: "heading3", label: "H3", title: "Heading 3" },
      { id: "heading4", label: "H4", title: "Heading 4" },
      { id: "heading5", label: "H5", title: "Heading 5" },
    ],
  },
  {
    label: "List",
    items: [
      { id: "bulletList", label: "\u2022", title: "Bullet List" },
      { id: "orderedList", label: "1.", title: "Numbered List" },
      { id: "taskList", label: "\u2610", title: "Task List" },
    ],
  },
  {
    label: "Block",
    items: [
      { id: "blockquote", label: "\u275D", title: "Quote" },
      { id: "codeBlock", label: "</>", title: "Code Block" },
      { id: "divider", label: "\u2014", title: "Divider" },
    ],
  },
  {
    label: "Insert",
    items: [
      { id: "link", label: "\uD83D\uDD17", title: "Link" },
      { id: "image", label: "\uD83D\uDDBC", title: "Image" },
      { id: "table", label: "\u25A6", title: "Table" },
      { id: "mathBlock", label: "\u2211", title: "Math Block" },
      { id: "callout", label: "\uD83D\uDCA1", title: "Callout" },
    ],
  },
];

const MANAGE_ITEMS: {
  id: BlockActionId;
  label: string;
  title: string;
  danger?: boolean;
}[] = [
  {
    id: "insertBefore",
    label: "\u2B06 Insert above",
    title: "Insert block above",
  },
  {
    id: "delete",
    label: "\uD83D\uDDD1 Delete",
    title: "Delete block",
    danger: true,
  },
  {
    id: "duplicate",
    label: "\uD83D\uDCC4 Duplicate",
    title: "Duplicate block",
  },
  {
    id: "insertAfter",
    label: "\u2B07 Insert below",
    title: "Insert block below",
  },
];

const TYPE_TO_ACTION: Record<string, string> = {
  ATXHeading1: "heading1",
  ATXHeading2: "heading2",
  ATXHeading3: "heading3",
  ATXHeading4: "heading4",
  ATXHeading5: "heading5",
  BulletList: "bulletList",
  OrderedList: "orderedList",
  Blockquote: "blockquote",
  FencedCode: "codeBlock",
  CodeBlock: "codeBlock",
};

export function BlockMenu({
  mode,
  position,
  onAction,
  onClose,
  activeType,
}: BlockMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback(
    (id: BlockActionId) => {
      onAction(id);
      onClose();
    },
    [onAction, onClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    setTimeout(
      () => document.addEventListener("mousedown", handleClickOutside),
      0,
    );
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const isActive = (id: BlockActionId): boolean => {
    return activeType ? TYPE_TO_ACTION[activeType] === id : false;
  };

  const menuWidth = 280;
  const menuHeight = 320;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-background border border-border rounded-lg shadow-xl py-2 px-3 min-w-[260px] max-w-[320px]"
      style={{ left, top }}
      role="menu"
    >
      {FORMAT_GROUPS.map((group) => {
        const items = group.items;
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="mb-2">
            <div className="text-xs text-muted-foreground font-medium mb-1 px-1">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`px-2 py-1 text-sm rounded border transition-colors ${
                    isActive(item.id)
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-background hover:bg-accent/50 border-border"
                  }`}
                  title={item.title}
                  onClick={() => handleAction(item.id)}
                  role="menuitem"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {mode === "combined" && (
        <>
          <div className="h-px bg-border my-2" />
          <div className="grid grid-cols-2 gap-1">
            {MANAGE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`px-2 py-1.5 text-sm rounded text-left transition-colors ${
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "hover:bg-accent/50"
                }`}
                title={item.title}
                onClick={() => handleAction(item.id)}
                role="menuitem"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
