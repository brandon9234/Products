import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TamTable } from "@/app/tam/tam-table";
import type { TamSnapshot } from "@/src/lib/tam/types";

const SAMPLE_SNAPSHOT: TamSnapshot = {
  columns: ["Market", "Revenue", "Active"],
  rows: [
    { Market: "North", Revenue: 1200, Active: true },
    { Market: "South", Revenue: 850, Active: false },
    { Market: "East", Revenue: 1400, Active: true }
  ],
  generatedAt: "2026-03-08T00:00:00.000Z",
  sourceFile: "data/raw/tam.xlsx",
  rowCount: 3
};

describe("TamTable", () => {
  it("renders every column from snapshot metadata", () => {
    render(<TamTable snapshot={SAMPLE_SNAPSHOT} />);

    expect(screen.getByRole("button", { name: "Sort by Market" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Active" })).toBeInTheDocument();
  });

  it("supports global search and per-column filtering", async () => {
    const user = userEvent.setup();
    render(<TamTable snapshot={SAMPLE_SNAPSHOT} />);

    await user.type(screen.getByLabelText("Global Search"), "north");
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.queryByText("South")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Global Search"));
    await user.type(screen.getByPlaceholderText("Filter Revenue"), "1400");
    expect(screen.getByText("East")).toBeInTheDocument();
    expect(screen.queryByText("North")).not.toBeInTheDocument();
  });

  it("supports sorting and pagination controls", async () => {
    const user = userEvent.setup();
    render(<TamTable snapshot={SAMPLE_SNAPSHOT} />);

    await user.selectOptions(screen.getByLabelText("Rows per page"), "25");
    await user.click(screen.getByRole("button", { name: "Sort by Revenue" }));

    const table = screen.getByRole("table");
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getByText("South")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Rows per page"), "2");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("shows an empty-results state when filters remove all rows", async () => {
    const user = userEvent.setup();
    render(<TamTable snapshot={SAMPLE_SNAPSHOT} />);

    await user.type(screen.getByLabelText("Global Search"), "no-match");
    expect(screen.getByText("No rows match the current filters.")).toBeInTheDocument();
  });
});

