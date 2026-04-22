import { useEffect, useRef, useCallback, useState } from "react";
import { BlockIcon, BlockIconName } from "./BlockIcon";

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
  items: { id: BlockActionId; icon: BlockIconName; title: string }[];
}

const FORMAT_GROUPS: MenuGroup[] = [
  {
    label: "Heading",
    items: [
      { id: "heading1", icon: "heading1", title: "Heading 1" },
      { id: "heading2", icon: "heading2", title: "Heading 2" },
      { id: "heading3", icon: "heading3", title: "Heading 3" },
      { id: "heading4", icon: "heading4", title: "Heading 4" },
      { id: "heading5", icon: "heading5", title: "Heading 5" },
    ],
  },
  {
    label: "List",
    items: [
      { id: "bulletList", icon: "bulletList", title: "Bullet List" },
      { id: "orderedList", icon: "orderedList", title: "Numbered List" },
      { id: "taskList", icon: "taskList", title: "Task List" },
    ],
  },
  {
    label: "Block",
    items: [
      { id: "blockquote", icon: "blockquote", title: "Quote" },
      { id: "codeBlock", icon: "codeBlock", title: "Code Block" },
      { id: "divider", icon: "divider", title: "Divider" },
    ],
  },
  {
    label: "Insert",
    items: [
      { id: "link", icon: "link", title: "Link" },
      { id: "image", icon: "image", title: "Image" },
      { id: "table", icon: "table", title: "Table" },
      { id: "mathBlock", icon: "mathBlock", title: "Math Block" },
      { id: "callout", icon: "callout", title: "Callout" },
    ],
  },
];

const MANAGE_ITEMS: {
  id: BlockActionId;
  icon: BlockIconName;
  label: string;
  title: string;
  danger?: boolean;
}[] = [
  {
    id: "insertBefore",
    icon: "insertAbove",
    label: "Insert above",
    title: "Insert block above",
  },
  {
    id: "delete",
    icon: "delete",
    label: "Delete",
    title: "Delete block",
    danger: true,
  },
  {
    id: "duplicate",
    icon: "duplicate",
    label: "Duplicate",
    title: "Duplicate block",
  },
  {
    id: "insertAfter",
    icon: "insertBelow",
    label: "Insert below",
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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 80);
  }, [onClose]);

  const handleAction = useCallback(
    (id: BlockActionId) => {
      onAction(id);
      handleClose();
    },
    [onAction, handleClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const handleEditorInput = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest(".cm-content")) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    setTimeout(
      () => document.addEventListener("mousedown", handleClickOutside),
      0,
    );
    document.addEventListener("beforeinput", handleEditorInput);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("beforeinput", handleEditorInput);
    };
  }, [handleClose]);

  const isActive = (id: BlockActionId): boolean => {
    return activeType ? TYPE_TO_ACTION[activeType] === id : false;
  };

  const menuWidth = 200;
  const menuHeight = 360;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className={`fixed z-[100] min-w-[200px] max-w-[240px] bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg p-1.5 transition-all duration-150 ${
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-1.5 scale-[0.96]"
      }`}
      style={{
        left,
        top,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      role="menu"
    >
      {FORMAT_GROUPS.map((group, groupIndex) => {
        const items = group.items;
        if (items.length === 0) return null;

        return (
          <div key={group.label}>
            {groupIndex > 0 && <div className="h-px bg-border/50 my-1.5" />}
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground px-1.5 mb-1">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => {
                const active = isActive(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-100 ${
                      active
                        ? "bg-primary/10 text-primary border-primary/25 ring-2 ring-primary/40"
                        : "bg-background text-foreground border-border hover:bg-accent/60 active:scale-95"
                    }`}
                    title={item.title}
                    onClick={() => handleAction(item.id)}
                    role="menuitem"
                    aria-pressed={active}
                  >
                    <BlockIcon name={item.icon} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {mode === "combined" && (
        <>
          <div className="h-px bg-border/50 my-1.5" />
          <div className="grid grid-cols-1 gap-0.5">
            {MANAGE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg text-left transition-colors duration-100 ${
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-foreground hover:bg-accent/60"
                }`}
                title={item.title}
                onClick={() => handleAction(item.id)}
                role="menuitem"
              >
                <BlockIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
