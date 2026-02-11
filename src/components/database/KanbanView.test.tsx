import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KanbanView } from "./KanbanView";

const getFilteredSortedRowsMock = vi.hoisted(() => vi.fn());
const openFileMock = vi.hoisted(() => vi.fn());
const addRowMock = vi.hoisted(() => vi.fn());
const updateCellMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const updateViewMock = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({ databases: {} as Record<string, any> }));

vi.mock("@/stores/useDatabaseStore", () => ({
  useDatabaseStore: () => ({
    databases: storeState.databases,
    addRow: addRowMock,
    updateCell: updateCellMock,
    updateView: updateViewMock,
    getFilteredSortedRows: getFilteredSortedRowsMock,
  }),
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: { openFile: typeof openFileMock }) => unknown) =>
    selector({ openFile: openFileMock }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      common: {
        settings: "Settings",
        open: "Open",
        edit: "Edit",
      },
      database: {
        kanbanMissingGroupTitle: "Set group column",
        kanbanMissingGroupDesc: "Kanban needs a group column",
        newCard: "New",
        ungrouped: "Ungrouped",
        noTitle: "Untitled",
      },
    },
  }),
}));

describe("KanbanView interactions", () => {
  it("opens note when clicking a kanban card", () => {
    const rows = [
      {
        id: "row-1",
        notePath: "/vault/alpha.md",
        noteTitle: "Alpha",
        cells: { status: "todo", title: "Alpha" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    storeState.databases = {
      "db-1": {
        id: "db-1",
        name: "Tasks",
        columns: [
          { id: "title", name: "Title", type: "text" },
          {
            id: "status",
            name: "Status",
            type: "select",
            options: [{ id: "todo", name: "Todo", color: "gray" }],
          },
        ],
        rows,
        views: [{ id: "view-kanban", name: "Kanban", type: "kanban", groupBy: "status" }],
        activeViewId: "view-kanban",
      },
    };
    getFilteredSortedRowsMock.mockReturnValue(rows);
    openFileMock.mockReset();
    updateCellMock.mockReset();

    render(<KanbanView dbId="db-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Open: Alpha" }));

    expect(openFileMock).toHaveBeenCalledWith("/vault/alpha.md");
  });

  it("falls back to noteTitle when title cell is empty", () => {
    const rows = [
      {
        id: "row-1",
        notePath: "/vault/no-cell-title.md",
        noteTitle: "From note title",
        cells: { status: "todo", title: "" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    storeState.databases = {
      "db-1": {
        id: "db-1",
        name: "Tasks",
        columns: [
          { id: "title", name: "Title", type: "text" },
          {
            id: "status",
            name: "Status",
            type: "select",
            options: [{ id: "todo", name: "Todo", color: "gray" }],
          },
        ],
        rows,
        views: [{ id: "view-kanban", name: "Kanban", type: "kanban", groupBy: "status" }],
        activeViewId: "view-kanban",
      },
    };
    getFilteredSortedRowsMock.mockReturnValue(rows);

    render(<KanbanView dbId="db-1" />);
    expect(screen.getByRole("button", { name: "Open: From note title" })).toBeInTheDocument();
  });

  it("supports inline title edit from kanban card", async () => {
    const rows = [
      {
        id: "row-1",
        notePath: "/vault/alpha.md",
        noteTitle: "Alpha",
        cells: { status: "todo", title: "Alpha" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    storeState.databases = {
      "db-1": {
        id: "db-1",
        name: "Tasks",
        columns: [
          { id: "title", name: "Title", type: "text" },
          {
            id: "status",
            name: "Status",
            type: "select",
            options: [{ id: "todo", name: "Todo", color: "gray" }],
          },
        ],
        rows,
        views: [{ id: "view-kanban", name: "Kanban", type: "kanban", groupBy: "status" }],
        activeViewId: "view-kanban",
      },
    };
    getFilteredSortedRowsMock.mockReturnValue(rows);
    updateCellMock.mockReset();

    render(<KanbanView dbId="db-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit: Alpha" }));

    const input = screen.getByRole("textbox", { name: "Edit: Alpha" });
    fireEvent.change(input, { target: { value: "Renamed task" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(updateCellMock).toHaveBeenCalledWith("db-1", "row-1", "title", "Renamed task");
    });
  });
});
