import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField } from "./date-field";

afterEach(cleanup);

describe("DateField", () => {
  it("shows the app's date format and still changes through the real input", () => {
    const onChange = vi.fn();
    const { container } = render(<DateField aria-label="Start date" value="2026-11-09" onChange={onChange} />);
    expect(container.textContent).toBe("9 Nov 2026");
    const input = screen.getByLabelText("Start date") as HTMLInputElement;
    expect(input.type).toBe("date");
    fireEvent.change(input, { target: { value: "2026-11-14" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("asks for a date when there is none", () => {
    const { container } = render(<DateField aria-label="Start date" value="" onChange={() => {}} />);
    expect(container.textContent).toBe("Choose a date");
  });
});
