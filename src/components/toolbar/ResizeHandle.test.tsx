import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses latest pointer position within the same animation frame", () => {
    const onResize = vi.fn();
    let rafCallback: ((timestamp: number) => void) | undefined;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: (timestamp: number) => void) => {
      rafCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container } = render(<ResizeHandle direction="left" onResize={onResize} />);
    const hitArea = container.querySelector(".z-30") as HTMLDivElement;

    fireEvent.mouseDown(hitArea, { clientX: 100 });

    fireEvent.mouseMove(document, { clientX: 110 });
    fireEvent.mouseMove(document, { clientX: 130 });

    expect(rafCallback).toBeDefined();
    if (!rafCallback) {
      throw new Error("RAF callback was not scheduled");
    }
    rafCallback(16);

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith(30);
  });

  it("keeps an expanded hit area around the thin divider", () => {
    const { container } = render(<ResizeHandle direction="left" onResize={vi.fn()} />);
    const hitArea = container.querySelector(".z-30") as HTMLDivElement;

    expect(hitArea.style.left).toBe("-1px");
    expect(hitArea.style.right).toBe("-7px");
  });
});
