import { useState, useRef, useEffect } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import type { ViewType, SortRule, DatabaseColumn, FilterGroup, FilterOperator, FilterRule, CellValue } from "@/types/database";
import { cn } from "@/lib/utils";
import {
  Plus,
  Table,
  Kanban,
  Calendar,
  LayoutGrid,
  Filter,
  ArrowUpDown,
  Search,
  MoreHorizontal,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  DatabaseActionButton,
  DatabaseIconButton,
  DatabaseMenuSurface,
  DatabaseTextInput,
} from "./primitives";

interface DatabaseToolbarProps {
  dbId: string;
}

const EMPTY_VALUE_OPERATORS = new Set<FilterOperator>(["is_empty", "is_not_empty", "is_checked", "is_not_checked"]);

const createLocalId = () => Math.random().toString(36).slice(2, 10);

function getOperatorsForColumnType(type: DatabaseColumn["type"]): FilterOperator[] {
  switch (type) {
    case "number":
      return [
        "equals",
        "not_equals",
        "greater_than",
        "greater_equal",
        "less_than",
        "less_equal",
        "is_empty",
        "is_not_empty",
      ];
    case "date":
      return ["date_is", "date_before", "date_after", "is_empty", "is_not_empty"];
    case "checkbox":
      return ["is_checked", "is_not_checked"];
    case "select":
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
    case "multi-select":
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case "text":
    case "url":
    case "formula":
    case "relation":
    default:
      return ["contains", "not_contains", "starts_with", "ends_with", "equals", "not_equals", "is_empty", "is_not_empty"];
  }
}

function getDefaultFilterValue(column: DatabaseColumn | undefined, operator: FilterOperator): CellValue {
  if (!column || EMPTY_VALUE_OPERATORS.has(operator)) return null;
  switch (column.type) {
    case "number":
      return 0;
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "select":
    case "multi-select":
      return column.options?.[0]?.id ?? null;
    case "checkbox":
      return false;
    default:
      return "";
  }
}

export function DatabaseToolbar({ dbId }: DatabaseToolbarProps) {
  const { t } = useLocaleStore();
  const { databases, addView, setActiveView, addRow, setSorts, setFilters } = useDatabaseStore();
  const db = databases[dbId];

  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const viewMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!db) return null;

  const activeView = db.views.find((v) => v.id === db.activeViewId);
  const sorts = activeView?.sorts || [];
  const filterGroup: FilterGroup = activeView?.filters || { type: "and", rules: [] };
  const filterRules = filterGroup.rules.filter((rule): rule is FilterRule => !("type" in rule));
  const hasFilters = filterRules.length > 0;

  const viewIcons: Record<ViewType, React.ReactNode> = {
    table: <Table className="w-4 h-4" />,
    kanban: <Kanban className="w-4 h-4" />,
    calendar: <Calendar className="w-4 h-4" />,
    gallery: <LayoutGrid className="w-4 h-4" />,
  };

  const handleAddView = (type: ViewType) => {
    const names: Record<ViewType, string> = {
      table: t.database.view.table,
      kanban: t.database.view.kanban,
      calendar: t.database.view.calendar,
      gallery: t.database.view.gallery,
    };
    addView(dbId, { type, name: names[type] });
    setShowViewMenu(false);
  };

  const handleAddSort = (columnId: string) => {
    if (!activeView) return;
    const newSort: SortRule = { columnId, direction: "asc" };
    setSorts(dbId, activeView.id, [...sorts, newSort]);
  };

  const handleRemoveSort = (index: number) => {
    if (!activeView) return;
    const newSorts = sorts.filter((_, i) => i !== index);
    setSorts(dbId, activeView.id, newSorts);
  };

  const handleToggleSortDirection = (index: number) => {
    if (!activeView) return;
    const newSorts = sorts.map((s, i) =>
      i === index ? { ...s, direction: s.direction === "asc" ? ("desc" as const) : ("asc" as const) } : s,
    );
    setSorts(dbId, activeView.id, newSorts);
  };

  const applyFilterRules = (nextRules: FilterRule[]) => {
    if (!activeView) return;
    setFilters(
      dbId,
      activeView.id,
      nextRules.length === 0
        ? undefined
        : {
            ...filterGroup,
            rules: nextRules,
          },
    );
  };

  const handleAddFilterRule = () => {
    const column = db.columns[0];
    if (!column) return;
    const operator = getOperatorsForColumnType(column.type)[0];
    const newRule: FilterRule = {
      id: createLocalId(),
      columnId: column.id,
      operator,
      value: getDefaultFilterValue(column, operator),
    };
    applyFilterRules([...filterRules, newRule]);
  };

  const handleFilterLogicChange = (type: FilterGroup["type"]) => {
    if (!activeView) return;
    if (filterRules.length === 0) return;
    setFilters(dbId, activeView.id, {
      ...filterGroup,
      type,
      rules: filterRules,
    });
  };

  const handleFilterRuleChange = (ruleId: string, updater: (rule: FilterRule) => FilterRule) => {
    const nextRules = filterRules.map((rule) => (rule.id === ruleId ? updater(rule) : rule));
    applyFilterRules(nextRules);
  };

  const handleRemoveFilterRule = (ruleId: string) => {
    const nextRules = filterRules.filter((rule) => rule.id !== ruleId);
    applyFilterRules(nextRules);
  };

  const renderFilterValueInput = (rule: FilterRule, column: DatabaseColumn) => {
    if (EMPTY_VALUE_OPERATORS.has(rule.operator)) return null;

    if (column.type === "select" || column.type === "multi-select") {
      return (
        <select
          value={typeof rule.value === "string" ? rule.value : ""}
          onChange={(e) =>
            handleFilterRuleChange(rule.id, (prev) => ({
              ...prev,
              value: e.target.value || null,
            }))
          }
          className="db-input h-8 min-w-[120px] px-2"
          aria-label={t.database.filterPanel.value}
        >
          <option value="">{t.database.filterPanel.selectValue}</option>
          {(column.options || []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }

    if (column.type === "number") {
      return (
        <DatabaseTextInput
          type="number"
          value={typeof rule.value === "number" ? String(rule.value) : ""}
          onChange={(e) =>
            handleFilterRuleChange(rule.id, (prev) => ({
              ...prev,
              value: e.target.value === "" ? null : Number(e.target.value),
            }))
          }
          className="h-8 min-w-[100px] px-2"
          aria-label={t.database.filterPanel.value}
          placeholder={t.database.filterPanel.valuePlaceholder}
        />
      );
    }

    if (column.type === "date") {
      return (
        <DatabaseTextInput
          type="date"
          value={typeof rule.value === "string" ? rule.value.slice(0, 10) : ""}
          onChange={(e) =>
            handleFilterRuleChange(rule.id, (prev) => ({
              ...prev,
              value: e.target.value || null,
            }))
          }
          className="h-8 min-w-[132px] px-2"
          aria-label={t.database.filterPanel.value}
        />
      );
    }

    return (
      <DatabaseTextInput
        type="text"
        value={typeof rule.value === "string" ? rule.value : ""}
        onChange={(e) =>
          handleFilterRuleChange(rule.id, (prev) => ({
            ...prev,
            value: e.target.value,
          }))
        }
        className="h-8 min-w-[120px] px-2"
        aria-label={t.database.filterPanel.value}
        placeholder={t.database.filterPanel.valuePlaceholder}
      />
    );
  };

  return (
    <div className="db-toolbar flex-shrink-0 px-4 py-2 flex items-center gap-2 flex-wrap">
      {/* 视图切换 */}
      <div className="relative" ref={viewMenuRef}>
        <div className="db-panel flex items-center gap-1 p-0.5">
          {db.views.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(dbId, view.id)}
              className="db-toggle-btn"
              data-active={view.id === db.activeViewId}
              aria-label={view.name}
              title={view.name}
            >
              {viewIcons[view.type]}
              <span>{view.name}</span>
            </button>
          ))}
          <DatabaseIconButton
            onClick={() => setShowViewMenu(!showViewMenu)}
            aria-label={t.database.newView}
            title={t.database.newView}
          >
            <Plus className="w-4 h-4" />
          </DatabaseIconButton>
        </div>

        {showViewMenu && (
          <DatabaseMenuSurface className="absolute top-full left-0 mt-1 p-1 min-w-[156px] z-50">
            <button onClick={() => handleAddView("table")} className="db-menu-item">
              <Table className="w-4 h-4" /> {t.database.viewMenu.table}
            </button>
            <button onClick={() => handleAddView("kanban")} className="db-menu-item">
              <Kanban className="w-4 h-4" /> {t.database.viewMenu.kanban}
            </button>
            <button
              onClick={() => handleAddView("calendar")}
              className="db-menu-item opacity-60 cursor-not-allowed"
              disabled
            >
              <Calendar className="w-4 h-4" /> {t.database.viewMenu.calendar}
            </button>
            <button
              onClick={() => handleAddView("gallery")}
              className="db-menu-item opacity-60 cursor-not-allowed"
              disabled
            >
              <LayoutGrid className="w-4 h-4" /> {t.database.viewMenu.gallery}
            </button>
          </DatabaseMenuSurface>
        )}
      </div>

      <div className="w-px h-5 bg-border/70" />

      {/* 筛选 */}
      <div className="relative" ref={filterMenuRef}>
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className={cn("db-toggle-btn", hasFilters && "border-border/70 bg-background text-foreground shadow-ui-card")}
          aria-label={t.database.filter}
          title={t.database.filter}
        >
          <Filter className="w-4 h-4" />
          {t.database.filter}
          {hasFilters && <span className="db-count-badge">{filterRules.length}</span>}
        </button>

        {showFilterMenu && (
          <DatabaseMenuSurface className="absolute top-full left-0 mt-1 p-2 min-w-[400px] max-w-[480px] z-50 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">{t.database.filterPanel.match}</span>
              <div className="db-panel flex items-center p-0.5">
                <button
                  className="db-toggle-btn h-7 px-2"
                  data-active={filterGroup.type === "and"}
                  onClick={() => handleFilterLogicChange("and")}
                  aria-label={t.database.filterPanel.allConditions}
                >
                  {t.database.filterPanel.allConditions}
                </button>
                <button
                  className="db-toggle-btn h-7 px-2"
                  data-active={filterGroup.type === "or"}
                  onClick={() => handleFilterLogicChange("or")}
                  aria-label={t.database.filterPanel.anyCondition}
                >
                  {t.database.filterPanel.anyCondition}
                </button>
              </div>
            </div>

            {filterRules.length === 0 ? (
              <div className="db-empty-state py-4">{t.database.filterPanel.empty}</div>
            ) : (
              <div className="space-y-2">
                {filterRules.map((rule) => {
                  const column = db.columns.find((col) => col.id === rule.columnId) || db.columns[0];
                  if (!column) return null;
                  const operators = getOperatorsForColumnType(column.type);
                  const currentOperator = operators.includes(rule.operator) ? rule.operator : operators[0];

                  return (
                    <div key={rule.id} className="db-panel p-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={rule.columnId}
                          onChange={(e) => {
                            const nextColumn = db.columns.find((col) => col.id === e.target.value) || db.columns[0];
                            const nextOperator = getOperatorsForColumnType(nextColumn.type)[0];
                            handleFilterRuleChange(rule.id, (prev) => ({
                              ...prev,
                              columnId: nextColumn.id,
                              operator: nextOperator,
                              value: getDefaultFilterValue(nextColumn, nextOperator),
                            }));
                          }}
                          className="db-input h-8 min-w-[132px] px-2"
                          aria-label={t.database.filterPanel.column}
                        >
                          {db.columns.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={currentOperator}
                          onChange={(e) => {
                            const nextOperator = e.target.value as FilterOperator;
                            handleFilterRuleChange(rule.id, (prev) => ({
                              ...prev,
                              operator: nextOperator,
                              value: getDefaultFilterValue(column, nextOperator),
                            }));
                          }}
                          className="db-input h-8 min-w-[138px] px-2"
                          aria-label={t.database.filterPanel.operator}
                        >
                          {operators.map((operator) => (
                            <option key={operator} value={operator}>
                              {t.database.filterOperators[operator]}
                            </option>
                          ))}
                        </select>

                        {renderFilterValueInput({ ...rule, operator: currentOperator }, column)}

                        <DatabaseIconButton
                          variant="subtle"
                          onClick={() => handleRemoveFilterRule(rule.id)}
                          aria-label={t.common.delete}
                          title={t.common.delete}
                        >
                          <X className="w-3.5 h-3.5" />
                        </DatabaseIconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button className="db-toggle-btn h-8 px-3" onClick={handleAddFilterRule}>
                <Plus className="w-4 h-4" />
                {t.database.filterPanel.addRule}
              </button>
              {filterRules.length > 0 && (
                <button className="db-toggle-btn h-8 px-3" onClick={() => applyFilterRules([])}>
                  {t.database.filterPanel.clearAll}
                </button>
              )}
            </div>
          </DatabaseMenuSurface>
        )}
      </div>

      {/* 排序 */}
      <div className="relative" ref={sortMenuRef}>
        <button
          onClick={() => setShowSortMenu(!showSortMenu)}
          className={cn("db-toggle-btn", sorts.length > 0 && "border-border/70 bg-background text-foreground shadow-ui-card")}
          aria-label={t.database.sort}
          title={t.database.sort}
        >
          <ArrowUpDown className="w-4 h-4" />
          {t.database.sort}
          {sorts.length > 0 && <span className="db-count-badge">{sorts.length}</span>}
        </button>

        {showSortMenu && (
          <DatabaseMenuSurface className="absolute top-full left-0 mt-1 py-2 min-w-[260px] z-50">
            {sorts.length > 0 && (
              <div className="px-3 pb-2 mb-2 border-b border-border/70 space-y-1">
                {sorts.map((sort, index) => {
                  const column = db.columns.find((c) => c.id === sort.columnId);
                  return (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{column?.name || t.database.unknownColumn}</span>
                      <DatabaseIconButton
                        variant="subtle"
                        onClick={() => handleToggleSortDirection(index)}
                        aria-label={sort.direction === "asc" ? t.database.sortDesc : t.database.sortAsc}
                        title={sort.direction === "asc" ? t.database.sortDesc : t.database.sortAsc}
                      >
                        {sort.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      </DatabaseIconButton>
                      <DatabaseIconButton
                        variant="subtle"
                        onClick={() => handleRemoveSort(index)}
                        aria-label={t.common.delete}
                        title={t.common.delete}
                      >
                        <X className="w-3 h-3" />
                      </DatabaseIconButton>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-2">
              <p className="px-1 text-xs text-muted-foreground mb-1">{t.database.addSort}</p>
              {db.columns.map((column) => (
                <button key={column.id} onClick={() => handleAddSort(column.id)} className="db-menu-item">
                  {column.name}
                </button>
              ))}
            </div>
          </DatabaseMenuSurface>
        )}
      </div>

      {/* 搜索 */}
      <div className="db-panel flex items-center gap-1.5 px-2 py-0.5">
        <Search className="w-4 h-4 text-muted-foreground" />
        <DatabaseTextInput
          type="text"
          placeholder={t.database.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t.common.search}
          className="h-8 w-36 border-transparent bg-transparent px-1.5 focus-visible:border-transparent focus-visible:shadow-none"
        />
      </div>

      <div className="flex-1" />

      {/* 新建行 */}
      <DatabaseActionButton onClick={() => addRow(dbId)}>
        <Plus className="w-4 h-4" />
        {t.database.newRow}
      </DatabaseActionButton>

      {/* 更多操作 */}
      <DatabaseIconButton
        aria-label={t.common.settings}
        title={t.common.settings}
      >
        <MoreHorizontal className="w-4 h-4" />
      </DatabaseIconButton>
    </div>
  );
}
