import { useEffect, useState } from "react";

declare global {
  interface LuminaBridge {
    windowControls?: {
      minimize(): void;
      maximize(): void;
      close(): void;
    };
  }
}

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().includes("MAC");

type Action = "close" | "minimize" | "maximize";

const buttons: ReadonlyArray<{
  action: Action;
  color: string;
  hoverColor: string;
  icon: string;
  label: string;
}> = [
  { action: "close", color: "#FF5F57", hoverColor: "#FF4136", icon: "×", label: "Close" },
  { action: "minimize", color: "#FEBC2E", hoverColor: "#F5A623", icon: "−", label: "Minimize" },
  { action: "maximize", color: "#28C840", hoverColor: "#1DB954", icon: "⤡", label: "Maximize" },
];

export function WindowControls() {
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<Action | null>(null);
  const [isFocused, setIsFocused] = useState(() =>
    typeof document !== "undefined" ? document.hasFocus() : true,
  );

  useEffect(() => {
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!isMac) return null;

  const handleClick = (action: Action) => {
    window.lumina?.windowControls?.[action]?.();
  };

  return (
    <div
      className="flex items-center gap-[6px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredAction(null);
      }}
      data-tauri-drag-region="false"
    >
      {buttons.map(({ action, color, hoverColor, icon, label }) => {
        const background = !isFocused
          ? "#CCCCCC"
          : hoveredAction === action
            ? hoverColor
            : color;
        return (
          <button
            key={action}
            type="button"
            onClick={() => handleClick(action)}
            onMouseEnter={() => setHoveredAction(action)}
            onMouseLeave={() => setHoveredAction(null)}
            className="flex items-center justify-center rounded-full transition-colors duration-100"
            style={{
              width: 10,
              height: 10,
              backgroundColor: background,
              fontSize: 7,
              lineHeight: 1,
              color: "rgba(0,0,0,0.55)",
              padding: 0,
              border: 0,
            }}
            aria-label={label}
          >
            {isHovered && isFocused ? icon : null}
          </button>
        );
      })}
    </div>
  );
}
