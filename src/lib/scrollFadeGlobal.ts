const ACTIVE_CLASS = "is-scroll-active";
const IDLE_MS = 720;

let installed = false;

export function installGlobalScrollFade(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

  const onScroll = (event: Event) => {
    const target = event.target;
    const el =
      target instanceof Element
        ? target
        : target instanceof Document
          ? target.documentElement
          : null;
    if (!el) return;

    el.classList.add(ACTIVE_CLASS);
    const existing = timers.get(el);
    if (existing) clearTimeout(existing);
    timers.set(
      el,
      setTimeout(() => {
        el.classList.remove(ACTIVE_CLASS);
        timers.delete(el);
      }, IDLE_MS),
    );
  };

  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
}
