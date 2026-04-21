import React from "react";

export type BlockIconName =
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
  | "divider"
  | "link"
  | "image"
  | "table"
  | "mathBlock"
  | "callout"
  | "insertAbove"
  | "delete"
  | "duplicate"
  | "insertBelow";

const ICONS: Record<BlockIconName, React.ReactNode> = {
  heading1: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3v10M3 8h5M8 3v10M13 8h-1.5M13 3v10" />
    </svg>
  ),
  heading2: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3v10M3 8h5M8 3v10M12 13c1.5 0 2.5-1 2.5-2.5S13.5 8 12 8s-2.5.5-2.5 2c0 1.5 1 2.5 2.5 2.5z" />
    </svg>
  ),
  heading3: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3v10M3 8h5M8 3v10M12.5 7c.8 0 1.5.7 1.5 1.5S13.3 10 12.5 10" />
      <path d="M12.5 10c.8 0 1.5.7 1.5 1.5S13.3 13 12.5 13" />
    </svg>
  ),
  heading4: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3v10M3 8h5M8 3v10M13 3v4M11 3h4" />
    </svg>
  ),
  heading5: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3v10M3 8h5M8 3v10M14 3h-3v3.5c.5-.3 1-.5 1.5-.5 1 0 1.5.8 1.5 1.5s-.5 1.5-1.5 1.5" />
    </svg>
  ),
  bulletList: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="4" cy="4" r="1" fill="currentColor" />
      <line x1="7" y1="4" x2="13" y2="4" />
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <line x1="7" y1="8" x2="13" y2="8" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  orderedList: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <text x="2" y="5.5" fontSize="5" fill="currentColor" stroke="none">
        1
      </text>
      <line x1="7" y1="4" x2="13" y2="4" />
      <text x="2" y="9.5" fontSize="5" fill="currentColor" stroke="none">
        2
      </text>
      <line x1="7" y1="8" x2="13" y2="8" />
      <text x="2" y="13.5" fontSize="5" fill="currentColor" stroke="none">
        3
      </text>
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  taskList: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2" y="2.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="4" x2="13" y2="4" />
      <rect x="2" y="6.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="8" x2="13" y2="8" />
      <rect x="2" y="10.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  blockquote: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M5 4c-1.5 1.5-2 3.5-1.5 5.5l1.5-.5c-.5-1.5 0-3 1-4zM11 4c-1.5 1.5-2 3.5-1.5 5.5l1.5-.5c-.5-1.5 0-3 1-4z" />
    </svg>
  ),
  codeBlock: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <polyline points="5 5 2 8 5 11" />
      <polyline points="11 5 14 8 11 11" />
    </svg>
  ),
  divider: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  ),
  link: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M7 9l2-2a2.5 2.5 0 013.5 0v0a2.5 2.5 0 010 3.5l-2.5 2.5a2.5 2.5 0 01-3.5 0" />
      <path d="M9 7L7 9a2.5 2.5 0 01-3.5 0v0a2.5 2.5 0 010-3.5l2.5-2.5a2.5 2.5 0 013.5 0" />
    </svg>
  ),
  image: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="5.5" cy="6.5" r="1" />
      <path d="M2 11l3-3 3 3 4-4 2 2" />
    </svg>
  ),
  table: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <line x1="2" y1="7" x2="14" y2="7" />
      <line x1="6.5" y1="3" x2="6.5" y2="13" />
      <line x1="10.5" y1="3" x2="10.5" y2="13" />
    </svg>
  ),
  mathBlock: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M5 3l-2 5 2 5M9 5h5M11.5 3v7" />
    </svg>
  ),
  callout: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M8 3v6M8 11.5v.5" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  ),
  insertAbove: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M8 12V4M4 7l4-4 4 4" />
    </svg>
  ),
  delete: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 4h10M6 4v9a1 1 0 001 1h2a1 1 0 001-1V4M7 2h2" />
    </svg>
  ),
  duplicate: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M11 3H4a1 1 0 00-1 1v7" />
    </svg>
  ),
  insertBelow: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M8 4v8M4 9l4 4 4-4" />
    </svg>
  ),
};

interface BlockIconProps {
  name: BlockIconName;
  className?: string;
}

export function BlockIcon({ name, className = "" }: BlockIconProps) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 ${className}`}
    >
      {ICONS[name]}
    </span>
  );
}
