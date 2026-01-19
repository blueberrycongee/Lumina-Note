import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";
import clsx from "clsx";
import { SUPPORTED_LOCALES, Locale } from "@/i18n";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface LanguageSwitcherProps {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  menuAlign?: "left" | "right";
  compact?: boolean;
  showLabel?: boolean;
  stopPropagation?: boolean;
}

/**
 * Reusable locale selector that persists choice via the locale store.
 */
export function LanguageSwitcher({
  className,
  buttonClassName,
  menuClassName,
  menuAlign = "right",
  compact = false,
  showLabel = false,
  stopPropagation = false,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useLocaleStore();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const label = useMemo(() => {
    return t.settings?.language || t.welcome?.language || "Language";
  }, [t]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        !buttonRef.current ||
        !menuRef.current ||
        buttonRef.current.contains(event.target as Node) ||
        menuRef.current.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);

  const handleSelect = (code: Locale) => {
    setLocale(code);
    setOpen(false);
  };

  const sizeClass = compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";

  return (
    <div
      className={clsx("relative", className)}
      data-tauri-drag-region="false"
      onMouseDown={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className={clsx(
          "inline-flex items-center gap-2 rounded-ui-md border border-border/60 bg-background/50 hover:bg-accent/60 transition-colors shadow-ui-card/70 backdrop-blur-sm",
          sizeClass,
          buttonClassName
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${label}: ${currentLocale?.nativeName || locale}`}
      >
        <Globe className="w-4 h-4" />
        {showLabel && <span className="font-medium">{label}</span>}
        <span>{currentLocale?.nativeName || locale}</span>
        <ChevronDown
          className={clsx(
            "w-4 h-4 transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          className={clsx(
            "absolute mt-1 w-44 rounded-ui-md border border-border/60 bg-background/80 backdrop-blur-md shadow-ui-float py-1 z-50",
            menuAlign === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc.code}
              onClick={() => handleSelect(loc.code as Locale)}
              className={clsx(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent/60 transition-colors flex items-center justify-between",
                locale === loc.code ? "text-primary font-medium" : ""
              )}
            >
              <div className="flex flex-col">
                <span>{loc.nativeName}</span>
                <span className="text-xs text-muted-foreground">{loc.name}</span>
              </div>
              {locale === loc.code && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
