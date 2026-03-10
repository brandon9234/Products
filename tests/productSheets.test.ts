import { describe, expect, it } from "vitest";

import {
  PRODUCT_CATEGORY_COLUMN,
  PRODUCT_SOURCE_COLUMN,
  buildDerivedProductSheets,
  buildProductSheetsByMachine
} from "@/src/lib/tam/productSheets";
import type { TamSheetSnapshot } from "@/src/lib/tam/types";

describe("buildDerivedProductSheets", () => {
  it("creates one derived sheet per unique product category", () => {
    const sheets: TamSheetSnapshot[] = [
      {
        name: "Substrates",
        columns: ["Material"],
        rows: [{ Material: "Acrylic" }],
        rowCount: 1
      },
      {
        name: "Acrylic",
        columns: [PRODUCT_CATEGORY_COLUMN, "Column 2", "Specific Substrate"],
        rows: [
          {
            [PRODUCT_CATEGORY_COLUMN]: "Wall Sign",
            "Column 2": null,
            "Specific Substrate": "Cast acrylic"
          },
          {
            [PRODUCT_CATEGORY_COLUMN]: "Award",
            "Column 2": null,
            "Specific Substrate": "Cast acrylic"
          }
        ],
        rowCount: 2
      },
      {
        name: "Wood",
        columns: [
          PRODUCT_CATEGORY_COLUMN,
          "Column 2",
          "Specific Substrate",
          "Machine used For Production"
        ],
        rows: [
          {
            [PRODUCT_CATEGORY_COLUMN]: "Wall Sign",
            "Column 2": null,
            "Specific Substrate": "Birch",
            "Machine used For Production": "CO2 Engraving"
          }
        ],
        rowCount: 1
      }
    ];

    const result = buildDerivedProductSheets(sheets);

    expect(result.productSheets.map((sheet) => sheet.productCategory)).toEqual([
      "Award",
      "Wall Sign"
    ]);
    expect(result.productSheets.map((sheet) => sheet.sku)).toEqual(["00001", "00002"]);
    expect(result.productSheets.every((sheet) => !sheet.columns.includes("Column 2"))).toBe(true);

    const wallSignSheet = result.productSheets.find(
      (sheet) => sheet.productCategory === "Wall Sign"
    );
    expect(wallSignSheet).toBeDefined();
    expect(wallSignSheet?.rowCount).toBe(2);
    expect(wallSignSheet?.sku).toBe("00002");
    expect(wallSignSheet?.columns).toEqual([
      PRODUCT_SOURCE_COLUMN,
      PRODUCT_CATEGORY_COLUMN,
      "Specific Substrate",
      "Machine used For Production"
    ]);
    expect(wallSignSheet?.rows[0][PRODUCT_SOURCE_COLUMN]).toBe("Acrylic");
    expect(wallSignSheet?.rows[1][PRODUCT_SOURCE_COLUMN]).toBe("Wood");
    expect(result.productCategoryToQueryKey["Wall Sign"]).toBe("product::wall-sign");
  });

  it("remaps image row indexes for derived product sheets", () => {
    const sheets: TamSheetSnapshot[] = [
      {
        name: "Acrylic",
        columns: [PRODUCT_CATEGORY_COLUMN, "Specific Substrate"],
        rows: [
          { [PRODUCT_CATEGORY_COLUMN]: "Sign", "Specific Substrate": "Cast acrylic" },
          { [PRODUCT_CATEGORY_COLUMN]: "Sign", "Specific Substrate": "Extruded acrylic" }
        ],
        rowCount: 2,
        images: [
          {
            rowIndex: 1,
            colIndex: 0,
            src: "/tam-assets/tam/acrylic.png",
            fileName: "acrylic.png"
          }
        ]
      }
    ];

    const result = buildDerivedProductSheets(sheets);
    const signSheet = result.productSheets.find((sheet) => sheet.productCategory === "Sign");

    expect(signSheet?.images).toEqual([
      {
        rowIndex: 1,
        colIndex: 0,
        src: "/tam-assets/tam/acrylic.png",
        fileName: "acrylic.png"
      }
    ]);
  });

  it("generates unique query keys when product slugs collide", () => {
    const sheets: TamSheetSnapshot[] = [
      {
        name: "Acrylic",
        columns: [PRODUCT_CATEGORY_COLUMN],
        rows: [
          { [PRODUCT_CATEGORY_COLUMN]: "A B" },
          { [PRODUCT_CATEGORY_COLUMN]: "A-B" }
        ],
        rowCount: 2
      }
    ];

    const result = buildDerivedProductSheets(sheets);
    const keys = result.productSheets.map((sheet) => sheet.queryKey);
    const skus = result.productSheets.map((sheet) => sheet.sku);

    expect(keys).toEqual(["product::a-b", "product::a-b-2"]);
    expect(skus).toEqual(["00001", "00002"]);
  });

  it("groups products by machine and includes products in every matching category", () => {
    const sheets: TamSheetSnapshot[] = [
      {
        name: "Acrylic",
        columns: [PRODUCT_CATEGORY_COLUMN, "Machine used For Production"],
        rows: [
          {
            [PRODUCT_CATEGORY_COLUMN]: "A Product",
            "Machine used For Production": "UV printer"
          },
          {
            [PRODUCT_CATEGORY_COLUMN]: "B Product",
            "Machine used For Production": "CO2 laser, CNC router"
          },
          {
            [PRODUCT_CATEGORY_COLUMN]: "C Product",
            "Machine used For Production": null
          }
        ],
        rowCount: 3
      }
    ];

    const { productSheets } = buildDerivedProductSheets(sheets);
    const grouped = buildProductSheetsByMachine(productSheets);

    const byLabel: Record<string, string[]> = Object.fromEntries(
      grouped.map((group) => [
        group.machineLabel,
        group.productSheets.map((sheet) => sheet.productCategory)
      ])
    );

    expect(byLabel["UV Printing"]).toEqual(["A Product"]);
    expect(byLabel["CO2 Engraving"]).toEqual(["B Product"]);
    expect(byLabel["Routering"]).toEqual(["B Product"]);
    expect(byLabel["Unassigned"]).toEqual(["C Product"]);
  });
});
