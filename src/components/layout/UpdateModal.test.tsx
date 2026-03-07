import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateModal } from "./UpdateModal";

const { hideAllWebViewsMock, showAllWebViewsMock } = vi.hoisted(() => ({
  hideAllWebViewsMock: vi.fn(),
  showAllWebViewsMock: vi.fn(),
}));

vi.mock("@/stores/useBrowserStore", () => ({
  useBrowserStore: () => ({
    hideAllWebViews: hideAllWebViewsMock,
    showAllWebViews: showAllWebViewsMock,
  }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      common: {
        close: "Close",
      },
      updateChecker: {
        title: "Software Update",
      },
    },
  }),
}));

vi.mock("../settings/UpdateChecker", () => ({
  UpdateChecker: () => <div>UpdateChecker</div>,
}));

describe("UpdateModal", () => {
  beforeEach(() => {
    hideAllWebViewsMock.mockClear();
    showAllWebViewsMock.mockClear();
  });

  it("renders the dedicated update workflow and toggles webviews with modal visibility", () => {
    const { rerender } = render(<UpdateModal isOpen onClose={() => undefined} />);

    expect(screen.getByTestId("update-modal")).toBeInTheDocument();
    expect(screen.getByText("UpdateChecker")).toBeInTheDocument();
    expect(hideAllWebViewsMock).toHaveBeenCalledTimes(1);

    rerender(<UpdateModal isOpen={false} onClose={() => undefined} />);

    expect(screen.queryByTestId("update-modal")).not.toBeInTheDocument();
    expect(showAllWebViewsMock).toHaveBeenCalledTimes(1);
  });
});
