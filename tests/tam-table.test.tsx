import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TamTable } from "@/app/tam/tam-table";
import type { TamSheetSnapshot } from "@/src/lib/tam/types";

const SAMPLE_SNAPSHOT: TamSheetSnapshot & {
  generatedAt: string;
  sourceFile: string;
} = {
  name: "Substrates",
  columns: ["Market", "Revenue", "Active"],
  rows: [
    { Market: "North", Revenue: 1200, Active: true },
    { Market: "South", Revenue: 850, Active: false },
    { Market: "East", Revenue: 1400, Active: true },
    ...Array.from({ length: 27 }, (_, index) => ({
      Market: `Region-${index + 1}`,
      Revenue: 2000 + index,
      Active: index % 2 === 0
    }))
  ],
  generatedAt: "2026-03-08T00:00:00.000Z",
  sourceFile: "data/raw/tam.xlsx",
  rowCount: 30
};

describe("TamTable", () => {
  it("renders every column from snapshot metadata", () => {
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);

    expect(screen.getByRole("button", { name: "Sort by Market" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Active" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New column name")).toBeInTheDocument();
  });

  it("supports editing a cell value locally", async () => {
    const user = userEvent.setup();
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);

    const targetInput = screen.getByDisplayValue("North");
    await user.clear(targetInput);
    await user.type(targetInput, "Northwest");
    expect(screen.getByDisplayValue("Northwest")).toBeInTheDocument();
  });

  it("supports sorting and pagination controls", async () => {
    const user = userEvent.setup();
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);

    await user.click(screen.getByRole("button", { name: "Sort by Revenue" }));

    const table = screen.getByRole("table");
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getByDisplayValue("South")).toBeInTheDocument();

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("renders upload controls for row images", () => {
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);
    expect(screen.getAllByText("Upload").length).toBeGreaterThan(0);
  });
});
