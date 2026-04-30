import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./select";

function renderSelect(onValueChange = vi.fn()) {
  render(
    <Select
      value="openai"
      onValueChange={onValueChange}
      options={[
        { value: "openai", label: "OpenAI" },
        { value: "deepseek", label: "DeepSeek" },
      ]}
    />,
  );

  const trigger = screen.getByRole("combobox");
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 100,
    left: 100,
    top: 100,
    right: 220,
    bottom: 140,
    width: 120,
    height: 40,
    toJSON: () => ({}),
  });
  return trigger;
}

describe("Select", () => {
  it("only applies hover chrome when the pointer is inside the rendered trigger", () => {
    const trigger = renderSelect();

    fireEvent.pointerEnter(trigger, { clientX: 300, clientY: 120 });
    expect(trigger).not.toHaveClass("bg-muted");

    fireEvent.pointerMove(trigger, { clientX: 160, clientY: 120 });
    expect(trigger).toHaveClass("bg-muted");

    fireEvent.pointerLeave(trigger);
    expect(trigger).not.toHaveClass("bg-muted");
  });

  it("ignores mouse clicks delivered outside the rendered trigger bounds", () => {
    const trigger = renderSelect();

    fireEvent(
      trigger,
      new MouseEvent("click", {
        bubbles: true,
        clientX: 300,
        clientY: 120,
        detail: 1,
      }),
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent(
      trigger,
      new MouseEvent("click", {
        bubbles: true,
        clientX: 160,
        clientY: 120,
        detail: 1,
      }),
    );
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
