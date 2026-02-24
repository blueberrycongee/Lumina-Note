import type { CellValue, DatabaseColumn, DatabaseRow } from "@/types/database";

const SAFE_FORMULA_EXPR = /^[\s\w+\-*/%().,<>=!&|:'"?,]+$/;
const IDENTIFIER_RE = /\b[A-Za-z_]\w*\b/g;

type FormulaFn = (...args: unknown[]) => unknown;

const FORMULA_FUNCTIONS: Record<string, FormulaFn> = {
  concat: (...args) => args.filter((arg) => arg !== null && arg !== undefined).map(toFormulaString).join(""),
  iff: (condition, whenTrue, whenFalse) => (Boolean(condition) ? whenTrue : whenFalse),
  lower: (value) => toFormulaString(value).toLowerCase(),
  upper: (value) => toFormulaString(value).toUpperCase(),
  len: (value) => {
    if (Array.isArray(value) || typeof value === "string") return value.length;
    if (value === null || value === undefined) return 0;
    return toFormulaString(value).length;
  },
  to_number: (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(toFormulaString(value));
    return Number.isFinite(parsed) ? parsed : null;
  },
  contains: (left, right) => toFormulaString(left).toLowerCase().includes(toFormulaString(right).toLowerCase()),
};

export function applyFormulaColumns(rows: DatabaseRow[], columns: DatabaseColumn[]): DatabaseRow[] {
  const formulaColumns = columns.filter(
    (column) => column.type === "formula" && typeof column.formula === "string" && column.formula.trim() !== "",
  );
  if (formulaColumns.length === 0) return rows;

  return rows.map((row) => {
    const cells = { ...row.cells };

    // Allow formula columns to reference each other using a bounded fixed-point pass.
    for (let pass = 0; pass < formulaColumns.length; pass += 1) {
      let changed = false;
      for (const column of formulaColumns) {
        const result = evaluateFormulaExpression(column.formula || "", { ...row, cells }, columns);
        if (!isCellValueEqual(cells[column.id], result)) {
          cells[column.id] = result;
          changed = true;
        }
      }
      if (!changed) break;
    }

    return { ...row, cells };
  });
}

export function evaluateFormulaExpression(formula: string, row: DatabaseRow, columns: DatabaseColumn[]): CellValue {
  const expression = normalizeFormulaExpression(formula);
  if (!expression) return null;

  try {
    const { compiledExpression, refs } = compileExpression(expression, row, columns);
    if (!compiledExpression) return null;

    const refEntries = Array.from(refs.entries());
    const refNames = refEntries.map(([name]) => name);
    const refValues = refEntries.map(([, value]) => value);

    const functionNames = Object.keys(FORMULA_FUNCTIONS);
    const functionValues = functionNames.map((name) => FORMULA_FUNCTIONS[name]);

    const runner = new Function(
      ...refNames,
      ...functionNames,
      `"use strict"; return (${compiledExpression});`,
    ) as (...args: unknown[]) => unknown;

    const result = runner(...refValues, ...functionValues);
    return toCellValue(result);
  } catch (error) {
    console.warn("[Database][Formula] evaluate failed:", error);
    return null;
  }
}

function normalizeFormulaExpression(formula: string): string {
  const trimmed = formula.trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  return withoutPrefix.replace(/\bif\s*\(/g, "iff(");
}

function compileExpression(
  expression: string,
  row: DatabaseRow,
  columns: DatabaseColumn[],
): { compiledExpression: string; refs: Map<string, unknown> } {
  const refs = new Map<string, unknown>();
  let refIndex = 0;
  const allocRef = (rawRef: string): string => {
    const key = `__ref${refIndex++}`;
    refs.set(key, resolveReferenceValue(rawRef, row, columns));
    return key;
  };

  let compiled = expression.replace(/prop\(\s*["']([^"']+)["']\s*\)/g, (_, refName: string) => allocRef(refName));
  compiled = compiled.replace(/\{([^{}]+)\}/g, (_, refName: string) => allocRef(refName));

  const compiledNoStrings = stripStringLiterals(compiled);

  if (!SAFE_FORMULA_EXPR.test(compiledNoStrings) || /[;[\]`]/.test(compiledNoStrings)) {
    return { compiledExpression: "", refs };
  }

  const allowedNames = new Set<string>([
    ...refs.keys(),
    ...Object.keys(FORMULA_FUNCTIONS),
    "true",
    "false",
    "null",
    "undefined",
  ]);

  const identifiers = compiledNoStrings.match(IDENTIFIER_RE) || [];
  for (const name of identifiers) {
    if (!allowedNames.has(name)) {
      return { compiledExpression: "", refs };
    }
  }

  return { compiledExpression: compiled, refs };
}

function stripStringLiterals(input: string): string {
  return input.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, "");
}

function resolveReferenceValue(rawRef: string, row: DatabaseRow, columns: DatabaseColumn[]): unknown {
  const key = rawRef.trim();
  if (!key) return null;

  if (key === "noteTitle" || key === "title") return row.noteTitle;

  const lower = key.toLowerCase();
  const column = columns.find((item) => item.id === key || item.name.toLowerCase() === lower);
  if (column) return row.cells[column.id] ?? null;

  return row.cells[key] ?? null;
}

function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (isDateValue(value)) return value;
  return toFormulaString(value);
}

function isDateValue(value: unknown): value is { start: string; end?: string } {
  return Boolean(value && typeof value === "object" && "start" in (value as Record<string, unknown>));
}

function toFormulaString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isDateValue(value)) return value.start;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value);
}

function isCellValueEqual(left: CellValue | undefined, right: CellValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
  }
  if (isDateValue(left) && isDateValue(right)) {
    return left.start === right.start && left.end === right.end;
  }
  return false;
}
