import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSidebarFileOperations } from "./useSidebarFileOperations";
import { useFileStore } from "@/stores/useFileStore";

function HookProbe() {
  const ops = useSidebarFileOperations();
  return <div>{ops.vaultPath ?? "no-vault"}</div>;
}

function ToggleProbe() {
  const ops = useSidebarFileOperations();
  return (
    <button onClick={() => ops.toggleExpanded("/vault/folder")}>toggle</button>
  );
}

describe("useSidebarFileOperations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not trigger unstable getSnapshot warnings in StrictMode", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <StrictMode>
        <HookProbe />
      </StrictMode>,
    );

    expect(screen.getByText("no-vault")).toBeInTheDocument();
    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0]).includes("The result of getSnapshot should be cached"),
      ),
    ).toBe(false);
  });

  it("loads folder children outside the expanded-path state updater", () => {
    const originalExpandDirectory = useFileStore.getState().expandDirectory;
    const expandDirectory = vi.fn(() => Promise.resolve());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    useFileStore.setState({
      vaultPath: "/vault",
      expandDirectory,
    });

    try {
      render(<ToggleProbe />);

      fireEvent.click(screen.getByRole("button", { name: "toggle" }));

      expect(expandDirectory).toHaveBeenCalledWith("/vault/folder");
      expect(
        errorSpy.mock.calls.some((args) =>
          String(args[0]).includes("Cannot update a component"),
        ),
      ).toBe(false);
    } finally {
      useFileStore.setState({ expandDirectory: originalExpandDirectory });
    }
  });
});
