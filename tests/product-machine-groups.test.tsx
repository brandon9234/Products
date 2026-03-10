import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProductMachineGroups from "@/app/tam/product-machine-groups";
import type { ProductSheetsByMachineGroup } from "@/src/lib/tam/productSheets";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock
  })
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

const fetchMock = vi.fn();

const PRODUCT_GROUPS: ProductSheetsByMachineGroup[] = [
  {
    machineKey: "uv-printing",
    machineLabel: "UV Printing",
    productSheets: [
      {
        name: "Acrylic Easel display stand",
        queryKey: "product::acrylic-easel-display-stand",
        productCategory: "Acrylic Easel display stand",
        sku: "00005",
        columns: ["Material", "Product Category"],
        rows: [
          {
            Material: "Acrylic",
            "Product Category": "Acrylic Easel display stand"
          }
        ],
        rowCount: 1
      }
    ]
  }
];

describe("ProductMachineGroups", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    refreshMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts a delete request and refreshes the route when a product table is removed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    } as Response);

    render(
      <ProductMachineGroups
        datasetId="tam"
        productSheetsByMachine={PRODUCT_GROUPS}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Delete product table 00005 Acrylic Easel display stand"
      })
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete product table "00005 Acrylic Easel display stand"? This removes rows with that product category from every material sheet.'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tam/datasets/tam/sheet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "delete-product-category",
          productCategory: "Acrylic Easel display stand"
        })
      })
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the API when deletion is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <ProductMachineGroups
        datasetId="tam"
        productSheetsByMachine={PRODUCT_GROUPS}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Delete product table 00005 Acrylic Easel display stand"
      })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
