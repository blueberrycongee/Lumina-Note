import { useErrorStore, type AppErrorLevel } from "@/stores/useErrorStore";

export type ReportOperationErrorInput = {
  source: string;
  action: string;
  error: unknown;
  userMessage?: string;
  level?: AppErrorLevel;
  context?: Record<string, unknown>;
};

const stringifyContext = (context?: Record<string, unknown>): string | undefined => {
  if (!context || Object.keys(context).length === 0) return undefined;
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return undefined;
  }
};

export const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "Unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const reportOperationError = ({
  source,
  action,
  error,
  userMessage,
  level = "error",
  context,
}: ReportOperationErrorInput): string => {
  const normalized = normalizeErrorMessage(error);
  const message = userMessage || normalized;
  const title = level === "warning" ? `${action} warning` : `${action} failed`;
  const detail = stringifyContext(context);
  const consoleMessage = `[${source}] ${title}: ${message}`;

  if (level === "warning") {
    console.warn(consoleMessage, error, context);
  } else {
    console.error(consoleMessage, error, context);
  }

  useErrorStore.getState().pushNotice({
    title,
    message,
    source,
    action,
    detail,
    level,
  });

  return message;
};

export const reportUnhandledError = (
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
) =>
  reportOperationError({
    source,
    action: "Unhandled runtime error",
    error,
    context,
    level: "error",
  });
