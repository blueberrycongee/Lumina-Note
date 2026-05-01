import { useCallback, type MouseEvent } from "react";

interface PluginViewPaneProps {
  title: string;
  html: string;
  scopeId?: string;
  onAction?: (action: string, data: Record<string, string>) => void;
}

/**
 * Collect data-* attributes from an element as a plain string record.
 */
function collectDataAttributes(el: HTMLElement): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-") && attr.name !== "data-plugin-action") {
      // Convert data-foo-bar → fooBar
      const key = attr.name
        .slice(5)
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      result[key] = attr.value;
    }
  }
  return result;
}

/**
 * Collect form field values from the nearest [data-plugin-form] ancestor (or the
 * action element itself if it carries data-plugin-form).
 */
function collectFormData(actionEl: HTMLElement): Record<string, string> {
  const form = actionEl.closest("[data-plugin-form]") as HTMLElement | null;
  if (!form) return {};
  const fields: Record<string, string> = {};
  const inputs = form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input[name], select[name], textarea[name]");
  for (const input of Array.from(inputs)) {
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      fields[input.name] = input.checked ? "true" : "false";
    } else {
      fields[input.name] = input.value;
    }
  }
  return fields;
}

export function PluginViewPane({ title, html, scopeId, onAction }: PluginViewPaneProps) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!onAction) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-plugin-action]");
      if (!target) return;
      e.preventDefault();
      const action = target.getAttribute("data-plugin-action") || "";
      if (!action) return;
      const data = {
        ...collectDataAttributes(target),
        ...collectFormData(target),
      };
      onAction(action, data);
    },
    [onAction],
  );

  return (
    <div
      className="flex-1 overflow-auto bg-popover dark:bg-background"
      data-lumina-plugin-scope={scopeId}
      onClick={handleClick}
    >
      <div className="px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="p-4">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
