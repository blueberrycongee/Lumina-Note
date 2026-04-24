const BOTTOM_REATTACH_THRESHOLD_PX = 24;
const SCROLL_UP_THRESHOLD_PX = 1;

export function updateStickyScrollState(
  element: HTMLElement,
  lastScrollTopRef: { current: number },
  isNearBottomRef: { current: boolean },
) {
  const previousScrollTop = lastScrollTopRef.current;
  const currentScrollTop = element.scrollTop;
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const distanceToBottom = maxScrollTop - currentScrollTop;

  if (currentScrollTop < previousScrollTop - SCROLL_UP_THRESHOLD_PX) {
    isNearBottomRef.current = false;
  } else if (distanceToBottom <= BOTTOM_REATTACH_THRESHOLD_PX) {
    isNearBottomRef.current = true;
  }

  lastScrollTopRef.current = currentScrollTop;
}

export function scrollStickyContainerToBottom(
  element: HTMLElement,
  lastScrollTopRef: { current: number },
) {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollTop = maxScrollTop;
  lastScrollTopRef.current = maxScrollTop;
}
