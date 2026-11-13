import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

describe("Phase 1 UI primitives", () => {
  it("merges tailwind classes cleanly with cn()", () => {
    const isHidden = false as boolean;
    expect(cn("px-2 py-1", "px-4", isHidden && "hidden")).toBe("py-1 px-4");
  });

  it("renders Button variants and supports asChild", () => {
    const onClick = vi.fn();
    render(
      <div>
        <Button variant="destructive" onClick={onClick}>
          Delete
        </Button>
        <Button asChild variant="outline">
          <a href="https://example.com">Docs</a>
        </Button>
      </div>
    );

    const btn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.className).toContain("bg-rose-600");

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("href")).toBe("https://example.com");
  });

  it("renders Input and fires change events", () => {
    const onChange = vi.fn();
    render(<Input placeholder="Game title" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Game title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hollow Knight" } });
    expect(onChange).toHaveBeenCalled();
    expect(input.value).toBe("Hollow Knight");
  });

  it("renders Switch with role=switch and toggles checked state", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Enable feature"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );
    const sw = screen.getByRole("switch", { name: "Enable feature" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("renders Badge variants", () => {
    render(<Badge variant="success">Active</Badge>);
    const badge = screen.getByText("Active");
    expect(badge.className).toContain("text-emerald-300");
  });
});
