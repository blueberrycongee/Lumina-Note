import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CalendarView } from "./CalendarView";

const updateCellMock = vi.hoisted(() => vi.fn());
const updateViewMock = vi.hoisted(() => vi.fn());
const getFilteredSortedRowsMock = vi.hoisted(() => vi.fn());
const openFileMock = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({ databases: {} as Record<string, any> }));

vi.mock("@/stores/useDatabaseStore", () => ({
  useDatabaseStore: () => ({
    databases: storeState.databases,
    getFilteredSortedRows: getFilteredSortedRowsMock,
    updateView: updateViewMock,
    updateCell: updateCellMock,
  }),
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: { openFile: typeof openFileMock }) => unknown) =>
    selector({ openFile: openFileMock }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    locale: "en",
    t: {
      database: {
        calendar: {
          dateColumn: "Date column",
          noDateColumnOption: "No date column",
          emptyDateStrategy: "Empty date strategy",
          emptyDateShow: "Show bucket",
          emptyDateHide: "Hide bucket",
          noDateColumnTitle: "Add a date column",
          noDateColumnDesc: "Date column is required",
          prevMonth: "Previous month",
          nextMonth: "Next month",
          today: "Today",
          noDateBucket: "No date",
          openNote: "Open note",
          openingNote: "Opening note...",
          openNoteSuccess: "Note opened",
          openNoteError: "Failed to open note",
          dragHint: "Drag to reschedule",
          rescheduling: "Updating date...",
          rescheduleSuccess: "Date updated",
          rescheduleError: "Failed to update date",
          more: "more",
        },
      },
    },
  }),
}));

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (format: string, value: string) => data.set(format, value),
    getData: (format: string) => data.get(format) || "",
    effectAllowed: "move",
    dropEffect: "move",
  } as unknown as DataTransfer;
}

describe("CalendarView interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T09:00:00.000Z"));

    openFileMock.mockReset();
    openFileMock.mockResolvedValue(undefined);
    updateCellMock.mockReset();
    updateCellMock.mockResolvedValue(true);
    updateViewMock.mockReset();
    getFilteredSortedRowsMock.mockReset();

    const rows = [
      {
        id: "row-1",
        notePath: "/vault/alpha.md",
        noteTitle: "Alpha",
        cells: { due: { start: "2026-02-10" } },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "row-2",
        notePath: "/vault/beta.md",
        noteTitle: "Beta",
        cells: { due: { start: "2026-02-12" } },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "row-3",
        notePath: "/vault/undated.md",
        noteTitle: "Undated",
        cells: {},
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
          { id: "due", name: "Due", type: "date" },
        ],
        rows,
        views: [
          {
            id: "view-calendar",
            name: "Calendar",
            type: "calendar",
            dateColumn: "due",
            calendarEmptyDateStrategy: "show",
          },
        ],
        activeViewId: "view-calendar",
      },
    };

    getFilteredSortedRowsMock.mockReturnValue(rows);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens note when clicking a calendar card", async () => {
    render(<CalendarView dbId="db-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open note: Alpha" }));
      await Promise.resolve();
    });

    expect(openFileMock).toHaveBeenCalledWith("/vault/alpha.md");
  });

  it("reschedules dated row by dragging card onto target day", async () => {
    render(<CalendarView dbId="db-1" />);

    const dataTransfer = createDataTransfer();
    await act(async () => {
      fireEvent.dragStart(screen.getByRole("button", { name: "Open note: Alpha" }), { dataTransfer });
      fireEvent.dragOver(screen.getByRole("gridcell", { name: "2026-02-14" }), { dataTransfer });
      fireEvent.drop(screen.getByRole("gridcell", { name: "2026-02-14" }), { dataTransfer });
      await Promise.resolve();
    });

    expect(updateCellMock).toHaveBeenCalledWith("db-1", "row-1", "due", { start: "2026-02-14" });
  });

  it("reschedules undated row when dropped onto a day cell", async () => {
    render(<CalendarView dbId="db-1" />);

    const dataTransfer = createDataTransfer();
    await act(async () => {
      fireEvent.dragStart(screen.getByRole("button", { name: "Open note: Undated" }), { dataTransfer });
      fireEvent.dragOver(screen.getByRole("gridcell", { name: "2026-02-16" }), { dataTransfer });
      fireEvent.drop(screen.getByRole("gridcell", { name: "2026-02-16" }), { dataTransfer });
      await Promise.resolve();
    });

    expect(updateCellMock).toHaveBeenCalledWith("db-1", "row-3", "due", { start: "2026-02-16" });
  });
});
