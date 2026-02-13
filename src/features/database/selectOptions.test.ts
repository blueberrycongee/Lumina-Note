import { describe, expect, it } from "vitest";
import { getSelectColorClasses, normalizeDatabaseDefinition, normalizeSelectOptions } from "./selectOptions";

describe("selectOptions normalization", () => {
  it("normalizes legacy string options into select option objects", () => {
    const normalized = normalizeSelectOptions(["会议", "商务洽谈", "会议"]);
    expect(normalized).toEqual([
      { id: "会议", name: "会议", color: "gray" },
      { id: "商务洽谈", name: "商务洽谈", color: "gray" },
      { id: "会议-2", name: "会议", color: "gray" },
    ]);
  });

  it("falls back to gray color when option color is invalid", () => {
    const normalized = normalizeSelectOptions([
      { id: "todo", name: "Todo", color: "neon" },
    ]);
    expect(normalized[0]).toMatchObject({ id: "todo", name: "Todo", color: "gray" });
    expect(getSelectColorClasses("neon")).toEqual(getSelectColorClasses("gray"));
  });

  it("normalizes select and multi-select columns in database definition", () => {
    const database = normalizeDatabaseDefinition({
      id: "db-1",
      name: "Tasks",
      columns: [
        { id: "status", name: "状态", type: "select", options: ["待定", "确认"] as any },
        {
          id: "tags",
          name: "标签",
          type: "multi-select",
          options: [{ name: "重要", color: "green" } as any],
        },
      ],
      views: [{ id: "v1", name: "Table", type: "table" }],
      activeViewId: "v1",
      createdAt: "2026-02-13T00:00:00.000Z",
      updatedAt: "2026-02-13T00:00:00.000Z",
    });

    const statusColumn = database.columns[0];
    const tagsColumn = database.columns[1];
    expect(statusColumn.options).toEqual([
      { id: "待定", name: "待定", color: "gray" },
      { id: "确认", name: "确认", color: "gray" },
    ]);
    expect(tagsColumn.options).toEqual([
      { id: "重要", name: "重要", color: "green" },
    ]);
  });
});
