import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverList } from "./popover";
import { Row } from "./row";
import { cn } from "@/lib/utils";

type PointerPoint = {
  clientX: number;
  clientY: number;
};

function isPointInsideElement(
  element: HTMLElement | null,
  point: PointerPoint,
): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

/**
 * Select — themed dropdown built on Popover + Row.
 *
 * Replaces native <select>, whose open list is rendered by the OS and
 * cannot be themed to the app's tokens. Same single-choice contract:
 * pass `options`, controlled `value`, `onValueChange` fires on pick.
 *
 * Keyboard:
 *   - Space / Enter / ArrowDown on closed trigger: open + focus selected
 *   - ArrowUp/ArrowDown navigate, Enter confirms, Escape closes
 *   - Home/End jump to first/last
 */

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: ReactNode;
  disabled?: boolean;
  className?: string;
  optionLabelClassName?: string;
  id?: string;
  "aria-label"?: string;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  optionLabelClassName,
  id,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [triggerHover, setTriggerHover] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastPointerRef = useRef<PointerPoint | null>(null);
  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const enabledIndices = useMemo(
    () => options.flatMap((o, i) => (o.disabled ? [] : [i])),
    [options],
  );
  const [highlight, setHighlight] = useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : enabledIndices[0] ?? 0;
  });

  // Re-anchor the highlight to the current value whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : enabledIndices[0] ?? 0);
  }, [open, options, value, enabledIndices]);

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      if (enabledIndices.length === 0) return;
      const cursor = enabledIndices.indexOf(highlight);
      const next =
        cursor === -1
          ? enabledIndices[delta === 1 ? 0 : enabledIndices.length - 1]
          : enabledIndices[
              (cursor + delta + enabledIndices.length) % enabledIndices.length
            ];
      setHighlight(next);
    },
    [enabledIndices, highlight],
  );

  const commit = useCallback(
    (option: SelectOption<T>) => {
      if (option.disabled) return;
      onValueChange(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onValueChange],
  );

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        event.preventDefault();
        if (enabledIndices.length) setHighlight(enabledIndices[0]);
        break;
      case "End":
        event.preventDefault();
        if (enabledIndices.length)
          setHighlight(enabledIndices[enabledIndices.length - 1]);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[highlight];
        if (option) commit(option);
        break;
      }
      default:
        break;
    }
  };

  const syncTriggerHover = useCallback((point: PointerPoint) => {
    const inside = isPointInsideElement(triggerRef.current, point);
    setTriggerHover(inside);
    return inside;
  }, []);

  useEffect(() => {
    if (!triggerHover) return;

    const handlePointerMove = (event: PointerEvent) => {
      const point = { clientX: event.clientX, clientY: event.clientY };
      lastPointerRef.current = point;
      syncTriggerHover(point);
    };
    const handleLayoutShift = () => {
      const point = lastPointerRef.current;
      if (point) syncTriggerHover(point);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("scroll", handleLayoutShift, true);
    window.addEventListener("resize", handleLayoutShift);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleLayoutShift, true);
      window.removeEventListener("resize", handleLayoutShift);
    };
  }, [syncTriggerHover, triggerHover]);

  return (
    <Popover open={open} onOpenChange={setOpen} anchor={triggerRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onPointerEnter={(event) => {
          const point = { clientX: event.clientX, clientY: event.clientY };
          lastPointerRef.current = point;
          syncTriggerHover(point);
        }}
        onPointerMove={(event) => {
          const point = { clientX: event.clientX, clientY: event.clientY };
          lastPointerRef.current = point;
          syncTriggerHover(point);
        }}
        onPointerLeave={() => setTriggerHover(false)}
        onClick={(event) => {
          if (
            event.detail !== 0 &&
            !isPointInsideElement(triggerRef.current, {
              clientX: event.clientX,
              clientY: event.clientY,
            })
          ) {
            return;
          }
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm",
          "[clip-path:inset(0_round_0.5rem)]",
          "bg-background/60 border border-border/60",
          "transition-colors",
          !disabled && (triggerHover || open) && "bg-muted",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
      >
        <span className="truncate text-left">
          {selectedOption?.label ?? (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <PopoverContent
        placement="bottom-end"
        className="min-w-[10rem]"
        onKeyDown={onListKeyDown}
      >
        <PopoverList>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Row
                key={option.value}
                density="compact"
                role="option"
                title={
                  optionLabelClassName ? (
                    <span className={optionLabelClassName}>{option.label}</span>
                  ) : (
                    option.label
                  )
                }
                description={option.description}
                selected={isSelected}
                disabled={option.disabled}
                data-selected={index === highlight}
                trailing={
                  isSelected ? (
                    <Check size={14} className="text-primary" />
                  ) : undefined
                }
                onSelect={() => commit(option)}
              />
            );
          })}
        </PopoverList>
      </PopoverContent>
    </Popover>
  );
}
