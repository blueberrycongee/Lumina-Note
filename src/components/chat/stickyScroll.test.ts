import { describe, expect, it } from "vitest";
import {
  scrollStickyContainerToBottom,
  updateStickyScrollState,
} from "./stickyScroll";

function makeScrollElement(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}) {
  return {
    scrollTop: input.scrollTop,
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
  } as HTMLElement;
}

describe("sticky chat scroll", () => {
  it("detaches from bottom on a small upward scroll even within the bottom threshold", () => {
    const element = makeScrollElement({
      scrollTop: 480,
      scrollHeight: 1000,
      clientHeight: 500,
    });
    const lastScrollTop = { current: 500 };
    const isNearBottom = { current: true };

    updateStickyScrollState(element, lastScrollTop, isNearBottom);

    expect(isNearBottom.current).toBe(false);
    expect(lastScrollTop.current).toBe(480);
  });

  it("reattaches when scrolling down to the bottom threshold", () => {
    const element = makeScrollElement({
      scrollTop: 480,
      scrollHeight: 1000,
      clientHeight: 500,
    });
    const lastScrollTop = { current: 450 };
    const isNearBottom = { current: false };

    updateStickyScrollState(element, lastScrollTop, isNearBottom);

    expect(isNearBottom.current).toBe(true);
  });

  it("scrolls directly to the bottom without relying on smooth scrollIntoView", () => {
    const element = makeScrollElement({
      scrollTop: 100,
      scrollHeight: 1000,
      clientHeight: 500,
    });
    const lastScrollTop = { current: 100 };

    scrollStickyContainerToBottom(element, lastScrollTop);

    expect(element.scrollTop).toBe(500);
    expect(lastScrollTop.current).toBe(500);
  });
});
