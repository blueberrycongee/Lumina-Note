import { describe, expect, it } from "vitest";
import type { DatabaseColumn } from "@/types/database";
import { resolveKanbanGroupColumnId } from "./kanbanUtils";

describe("kanbanUtils", () => {
  it("resolves kanban group-column mapping with fallback", () => {
    const columns: DatabaseColumn[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "status", name: "Status", type: "select" },
      { id: "tags", name: "Tags", type: "multi-select" },
    ];

    expect(resolveKanbanGroupColumnId(columns, "tags")).toBe("tags");
    expect(resolveKanbanGroupColumnId(columns, "missing")).toBe("status");
    expect(resolveKanbanGroupColumnId(columns)).toBe("status");
  });

  it("returns null when no groupable columns exist", () => {
    const columns: DatabaseColumn[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "due", name: "Due", type: "date" },
    ];
    expect(resolveKanbanGroupColumnId(columns)).toBeNull();
  });
});
