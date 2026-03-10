"use client";

import Link from "next/link";
import { useState } from "react";

import type { ProductSheetsByMachineGroup } from "@/src/lib/tam/productSheets";

interface ProductMachineGroupsProps {
  productSheetsByMachine: ProductSheetsByMachineGroup[];
  selectedProductQueryKey?: string;
}

function ProductMachineGroups({
  productSheetsByMachine,
  selectedProductQueryKey
}: ProductMachineGroupsProps) {
  const [collapsed, setCollapsed] = useState(false);

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
                  <Link
                    key={`${machineGroup.machineKey}-${sheet.queryKey}`}
                    href={`/tam?sheet=${encodeURIComponent(sheet.queryKey)}`}
                    className={`tab-link ${
                      selectedProductQueryKey === sheet.queryKey ? "active" : ""
                    }`}
                  >
                    {`${sheet.sku} ${sheet.productCategory}`}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default ProductMachineGroups;
