import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TamTable } from "@/app/tam/tam-table";
import type { TamSheetSnapshot } from "@/src/lib/tam/types";

const fetchMock = vi.fn();

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
    ...Array.from({ length: 28 }, (_, index) => ({
      Market: `Region-${index + 1}`,
      Revenue: 2000 + index,
      Active: index % 2 === 0
    }))
  ],
  generatedAt: "2026-03-08T00:00:00.000Z",
  sourceFile: "data/raw/tam.xlsx",
  rowCount: 31
};

const MATERIAL_SNAPSHOT: TamSheetSnapshot & {
  generatedAt: string;
  sourceFile: string;
} = {
  name: "Acrylic",
  columns: [
    "Product Category",
    "Machine used For Production",
    "Specific Substrate"
  ],
  rows: [
    {
      "Product Category": "Corporate Wall Plaque",
      "Machine used For Production": "CO2 laser, CNC router",
      "Specific Substrate": "Cast acrylic"
    }
  ],
  generatedAt: "2026-03-08T00:00:00.000Z",
  sourceFile: "data/raw/tam.xlsx",
  rowCount: 1
};

const PRODUCT_SNAPSHOT: TamSheetSnapshot & {
  generatedAt: string;
  sourceFile: string;
} = {
  name: "Corporate Wall Plaque",
  columns: [
    "Material",
    "Product Category",
    "Machine used For Production",
    "Specific Substrate"
  ],
  rows: [
    {
      Material: "Acrylic",
      "Product Category": "Corporate Wall Plaque",
      "Machine used For Production": "CO2 Engraving, Routering",
      "Specific Substrate": "Cast acrylic"
    }
  ],
  generatedAt: "2026-03-08T00:00:00.000Z",
  sourceFile: "data/raw/tam.xlsx",
  rowCount: 1
};

function createDataTransferStub(initialColumnName: string): DataTransfer {
  let currentValue = initialColumnName;
  return {
    effectAllowed: "all",
    setData: vi.fn((_format: string, value: string) => {
      currentValue = value;
    }),
    getData: vi.fn(() => currentValue)
  } as unknown as DataTransfer;
}

describe("TamTable", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("supports resizing columns", () => {
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);

    const resizeHandle = screen.getByRole("button", { name: "Resize column Market" });
    fireEvent.mouseDown(resizeHandle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 180 });
    fireEvent.mouseUp(window);

    const columnElements = screen.getByRole("table").querySelectorAll("col");
    expect(columnElements[1]).toHaveStyle({ width: "340px" });
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

  it("defaults the Substrates sheet to 30 rows per page", () => {
    render(<TamTable datasetId="tam" snapshot={SAMPLE_SNAPSHOT} />);

    expect(screen.getByLabelText("Rows per page")).toHaveValue("30");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("renders upload icon controls and deletes row images", async () => {
    const user = userEvent.setup();
    const snapshotWithImages: typeof SAMPLE_SNAPSHOT = {
      ...SAMPLE_SNAPSHOT,
      images: [
        {
          rowIndex: 0,
          colIndex: 0,
          src: "/tam-assets/tam/manual/sample.png",
          fileName: "sample.png"
        }
      ]
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sheet: {
          ...snapshotWithImages,
          images: []
        }
      })
    } as Response);

    render(<TamTable datasetId="tam" snapshot={snapshotWithImages} />);

    expect(screen.getByLabelText("Upload image for row 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete sample.png" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tam/datasets/tam/images",
      expect.objectContaining({
        method: "DELETE"
      })
    );
    expect(await screen.findByText("Image deleted.")).toBeInTheDocument();
  });

  it("renders machine dropdown and saves production machine selections", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sheet: {
          ...MATERIAL_SNAPSHOT,
          rows: [
            {
              ...MATERIAL_SNAPSHOT.rows[0],
              "Machine used For Production": "CO2 laser"
            }
          ]
        }
      })
    } as Response);

    render(<TamTable datasetId="tam" snapshot={MATERIAL_SNAPSHOT} />);

    expect(screen.getByText("CO2 Engraving, Routering")).toBeInTheDocument();
    expect(screen.getByText("You can select as many as you want.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "CO2 Engraving" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Routering" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Routering" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tam/datasets/tam/sheet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "update-cell",
          sheetName: "Acrylic",
          rowIndex: 0,
          columnName: "Machine used For Production",
          value: "CO2 Engraving"
        })
      })
    );
  });

  it("shows product links in material product-category cells", () => {
    render(
      <TamTable
        datasetId="tam"
        snapshot={MATERIAL_SNAPSHOT}
        productCategoryToQueryKey={{
          "Corporate Wall Plaque": "product::corporate-wall-plaque"
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Open product table" })).toHaveAttribute(
      "href",
      "/tam?sheet=product%3A%3Acorporate-wall-plaque"
    );
  });

  it("renders read-only product tables with material links", () => {
    render(
      <TamTable
        datasetId="tam"
        snapshot={PRODUCT_SNAPSHOT}
        readOnly
        productCategoryToQueryKey={{
          "Corporate Wall Plaque": "product::corporate-wall-plaque"
        }}
      />
    );

    expect(screen.getByText("Read-only product table")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("New column name")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Acrylic")).toHaveAttribute("readonly");
    expect(screen.getByRole("link", { name: "Open material table" })).toHaveAttribute(
      "href",
      "/tam?sheet=Acrylic"
    );
  });

  it("reorders and deletes material columns", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sheet: {
            ...MATERIAL_SNAPSHOT,
            columns: [
              "Machine used For Production",
              "Product Category",
              "Specific Substrate"
            ]
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sheet: {
            ...MATERIAL_SNAPSHOT,
            columns: [
              "Machine used For Production",
              "Specific Substrate"
            ],
            rows: [
              {
                "Machine used For Production": "CO2 laser, CNC router",
                "Specific Substrate": "Cast acrylic"
              }
            ]
          }
        })
      } as Response);

    render(<TamTable datasetId="tam" snapshot={MATERIAL_SNAPSHOT} />);

    const dragHandle = screen.getByRole("button", { name: "Drag column Product Category" });
    const machineColumnHeader = screen.getByRole("columnheader", {
      name: /Machine used For Production/
    });
    const dataTransfer = createDataTransferStub("Product Category");

    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(machineColumnHeader, { dataTransfer, clientX: 9999 });
    fireEvent.drop(machineColumnHeader, { dataTransfer, clientX: 9999 });
    fireEvent.dragEnd(dragHandle, { dataTransfer });

    await screen.findByText("Column order updated.");
    await user.click(screen.getByRole("button", { name: "Delete column Product Category" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete column "Product Category"? This will remove its values from the snapshot.'
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tam/datasets/tam/sheet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "reorder-column",
          sheetName: "Acrylic",
          columnName: "Product Category",
          targetIndex: 1
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tam/datasets/tam/sheet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "delete-column",
          sheetName: "Acrylic",
          columnName: "Product Category"
        })
      })
    );
  });
});
