import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionTooltip } from "@/components/ui/tooltip";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("Extended UI primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Select, Slider, RadioGroup, Textarea, Progress and Card", () => {
    const onSliderChange = vi.fn();
    const onRadioChange = vi.fn();
    const onTextChange = vi.fn();

    render(
      <div className="space-y-4">
        <Select defaultValue="steam">
          <SelectTrigger aria-label="Store selector">
            <SelectValue placeholder="Choose store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="steam">Steam</SelectItem>
            <SelectItem value="gog">GOG</SelectItem>
          </SelectContent>
        </Select>

        <Slider
          min={10}
          max={100}
          step={10}
          value={[40]}
          onValueChange={onSliderChange}
          aria-label="Zoom slider"
        />

        <RadioGroup defaultValue="sessions" onValueChange={onRadioChange} aria-label="Reset scope">
          <RadioGroupItem value="sessions" aria-label="Sessions only" />
          <RadioGroupItem value="all" aria-label="All data" />
        </RadioGroup>

        <Textarea placeholder="Game synopsis" onChange={onTextChange} />

        <Progress value={65} aria-label="Sync progress" />

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Overview</CardDescription>
          </CardHeader>
          <CardContent>Details body</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      </div>
    );

    const combobox = screen.getByRole("combobox", { name: "Store selector" });
    expect(combobox.textContent).toContain("Steam");

    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("40");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSliderChange).toHaveBeenCalledWith([50]);

    const radioAll = screen.getByRole("radio", { name: "All data" });
    fireEvent.click(radioAll);
    expect(onRadioChange).toHaveBeenCalledWith("all");

    const textarea = screen.getByPlaceholderText("Game synopsis") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Bug-themed metroidvania" } });
    expect(onTextChange).toHaveBeenCalled();
    expect(textarea.value).toBe("Bug-themed metroidvania");

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByText("Details body")).toBeTruthy();
  });

  it("renders Checkbox, Table, Skeleton, and standalone ActionTooltip primitives", () => {
    const onCheckedChange = vi.fn();
    render(
      <div>
        <Checkbox aria-label="Select game" checked={false} onCheckedChange={onCheckedChange} />
        <Skeleton data-testid="skel" className="h-4 w-20" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Silksong</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <ActionTooltip label="Standalone hint">
          <button type="button">Hover me</button>
        </ActionTooltip>
      </div>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select game" });
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    expect(screen.getByTestId("skel").className).toContain("animate-pulse");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Silksong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hover me" })).toBeTruthy();
  });
});
