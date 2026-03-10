"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  DerivedProductSheet,
  ProductSheetsByMachineGroup
} from "@/src/lib/tam/productSheets";

interface ProductMachineGroupsProps {
  datasetId: "tam";
  productSheetsByMachine: ProductSheetsByMachineGroup[];
  selectedProductQueryKey?: string;
}

function ProductMachineGroups({
  datasetId,
  productSheetsByMachine,
  selectedProductQueryKey
}: ProductMachineGroupsProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [deletingQueryKey, setDeletingQueryKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteProductSheet(sheet: DerivedProductSheet) {
    const tableLabel = `${sheet.sku} ${sheet.productCategory}`;
    if (
      !window.confirm(
        `Delete product table "${tableLabel}"? This removes rows with that product category from every material sheet.`
      )
    ) {
      return;
    }

    try {
      setDeletingQueryKey(sheet.queryKey);
      setDeleteError(null);

      const response = await fetch(`/api/tam/datasets/${datasetId}/sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "delete-product-category",
          productCategory: sheet.productCategory
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to delete product table.");
      }

      router.refresh();
    } catch (error) {
      setDeleteError(`Delete failed: ${(error as Error).message}`);
    } finally {
      setDeletingQueryKey(null);
    }
  }

  return (
    <section className="sheet-group">
      <div className="sheet-group-title-row">
        <p className="sheet-group-title">Products by Machine</p>
        <button
          type="button"
          className="sheet-group-toggle"
          aria-expanded={!collapsed}
          onClick={() => {
            setCollapsed((current) => !current);
          }}
        >
          <span aria-hidden="true">{collapsed ? ">" : "v"}</span>
          <span>{collapsed ? "Expand" : "Minimize"}</span>
        </button>
      </div>
      {!collapsed ? (
        <div className="machine-groups">
          {productSheetsByMachine.map((machineGroup) => (
            <section key={machineGroup.machineKey} className="machine-group">
              <p className="machine-group-title">{machineGroup.machineLabel}</p>
              <div className="tab-nav tab-nav-products">
                {machineGroup.productSheets.map((sheet) => (
                  <div
                    key={`${machineGroup.machineKey}-${sheet.queryKey}`}
                    className={`tab-link-pill ${
                      selectedProductQueryKey === sheet.queryKey ? "active" : ""
                    }`}
                  >
                    <Link
                      href={`/tam?sheet=${encodeURIComponent(sheet.queryKey)}`}
                      className="tab-link tab-link-product"
                    >
                      {`${sheet.sku} ${sheet.productCategory}`}
                    </Link>
                    <button
                      type="button"
                      className="tab-link-delete"
                      aria-label={`Delete product table ${sheet.sku} ${sheet.productCategory}`}
                      onClick={() => {
                        void deleteProductSheet(sheet);
                      }}
                      disabled={deletingQueryKey !== null}
                    >
                      {deletingQueryKey === sheet.queryKey ? "..." : "x"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {deletingQueryKey ? (
        <p className="sheet-group-message">Deleting product table...</p>
      ) : null}
      {deleteError ? <p className="sheet-group-message is-error">{deleteError}</p> : null}
    </section>
  );
}

export default ProductMachineGroups;
