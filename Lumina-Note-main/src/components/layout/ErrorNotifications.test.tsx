import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorNotifications } from "./ErrorNotifications";
import { useErrorStore, type AppErrorNotice } from "@/stores/useErrorStore";

const seedNotice = (): AppErrorNotice => ({
  id: "notice-1",
  title: "Unhandled runtime error failed",
  message: "boom",
  level: "error",
  count: 1,
  createdAt: Date.now(),
  lastSeenAt: Date.now(),
});

describe("ErrorNotifications", () => {
  afterEach(() => {
    useErrorStore.setState({ notices: [] });
    vi.restoreAllMocks();
  });

  it("does not trigger unstable getSnapshot warning in StrictMode", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      useErrorStore.setState({ notices: [seedNotice()] });
    });

    render(
      <StrictMode>
        <ErrorNotifications />
      </StrictMode>,
    );

    expect(screen.getByText("Unhandled runtime error failed")).toBeInTheDocument();
    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0]).includes("The result of getSnapshot should be cached"),
      ),
    ).toBe(false);

  });
});
