import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

/**
 * Mock pointer capture APIs on a DOM element (jsdom doesn't implement them).
 */
function mockPointerCapture(el: HTMLElement) {
  let captured = false;
  el.setPointerCapture = vi.fn(() => { captured = true; });
  el.releasePointerCapture = vi.fn(() => { captured = false; });
  el.hasPointerCapture = vi.fn(() => captured);
}

/**
 * jsdom's PointerEvent constructor doesn't reliably pass MouseEvent init
 * properties (clientX, etc.). Dispatch a MouseEvent with the pointer event
 * type name — React matches on the type string, not the constructor.
 */
function firePointer(el: Element, type: string, init: MouseEventInit = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

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
    mockPointerCapture(hitArea);

    firePointer(hitArea, "pointerdown", { clientX: 100 });

    firePointer(hitArea, "pointermove", { clientX: 110 });
    firePointer(hitArea, "pointermove", { clientX: 130 });

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

  it("keeps the right-side divider hit area expanded and flips drag deltas", () => {
    const onResize = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container } = render(<ResizeHandle direction="right" onResize={onResize} />);
    const hitArea = container.querySelector(".z-30") as HTMLDivElement;
    mockPointerCapture(hitArea);

    expect(hitArea.style.left).toBe("-1px");
    expect(hitArea.style.right).toBe("-7px");

    firePointer(hitArea, "pointerdown", { clientX: 100 });
    firePointer(hitArea, "pointermove", { clientX: 120 });

    // pointerUp fires while capture is still held (browser releases after the event)
    firePointer(hitArea, "pointerup", { clientX: 120 });

    expect(onResize).toHaveBeenCalledWith(-20);
  });
});
