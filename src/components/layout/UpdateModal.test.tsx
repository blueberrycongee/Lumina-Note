import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UpdateModal } from "./UpdateModal";

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
  it("renders the dedicated update workflow", () => {
    const { rerender } = render(<UpdateModal isOpen onClose={() => undefined} />);

    expect(screen.getByTestId("update-modal")).toBeInTheDocument();
    expect(screen.getByText("UpdateChecker")).toBeInTheDocument();

    rerender(<UpdateModal isOpen={false} onClose={() => undefined} />);

    expect(screen.queryByTestId("update-modal")).not.toBeInTheDocument();
  });
});
