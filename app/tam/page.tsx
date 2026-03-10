import Link from "next/link";
import path from "node:path";

import { loadTamSnapshot } from "@/src/lib/tam/loadSnapshot";
import {
  buildDerivedProductSheets,
  buildProductSheetsByMachine
} from "@/src/lib/tam/productSheets";

import ProductMachineGroups from "./product-machine-groups";
import TamTable from "./tam-table";

interface TamPageProps {
  searchParams?: Promise<{
    sheet?: string | string[];
  }>;
}

export default async function TamPage({ searchParams }: TamPageProps) {
  const result = await loadTamSnapshot();
  const snapshotPath = path.join(process.cwd(), "data", "tam.snapshot.json");

  if (result.status === "missing") {
    return (
      <main className="page-shell page-shell-wide">
        <section className="message-card">
          <h1>TAM Snapshot Not Found</h1>
          <p>
            Create <code>{snapshotPath}</code> by running:
          </p>
          <pre>
            <code>npm run import:tam -- --input &quot;data/raw/tam.xlsx&quot; --sheet TAM</code>
          </pre>
          <p>
            If your export is CSV, use <code>--input &quot;data/raw/tam.csv&quot;</code>.
          </p>
          <Link href="/" className="secondary-link">
            Back to home
          </Link>
        </section>
      </main>
    );
  }

  if (result.status === "malformed") {
    return (
      <main className="page-shell page-shell-wide">
        <section className="message-card">
          <h1>TAM Snapshot Is Malformed</h1>
          <p>
            <strong>Path:</strong> <code>{result.snapshotPath}</code>
          </p>
          <p>
            <strong>Error:</strong> {result.error}
          </p>
          <p>Re-run import to regenerate a clean snapshot.</p>
          <pre>
            <code>npm run import:tam -- --input &quot;data/raw/tam.xlsx&quot; --sheet TAM</code>
          </pre>
          <Link href="/" className="secondary-link">
            Back to home
          </Link>
        </section>
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const requestedSheet = toQueryValue(resolvedSearchParams?.sheet);
  const substratesSheet = result.snapshot.sheets.find((sheet) => sheet.name === "Substrates");
  const materialSheets = result.snapshot.sheets.filter((sheet) => sheet.name !== "Substrates");
  const { productSheets, productCategoryToQueryKey } = buildDerivedProductSheets(
    result.snapshot.sheets
  );
  const productSheetsByMachine = buildProductSheetsByMachine(productSheets);
  const productSheetsByQueryKey = new Map(
    productSheets.map((sheet) => [sheet.queryKey, sheet] as const)
  );
  const selectedProductSheet = requestedSheet
    ? productSheetsByQueryKey.get(requestedSheet)
    : undefined;
  const selectedWorkbookSheet =
    result.snapshot.sheets.find((sheet) => sheet.name === requestedSheet) ??
    result.snapshot.sheets.find((sheet) => sheet.name === result.snapshot.defaultSheet) ??
    result.snapshot.sheets[0] ?? {
      name: "TAM",
      columns: [],
      rows: [],
      rowCount: 0
    };
  const selectedSheet = selectedProductSheet ?? selectedWorkbookSheet;
  const isProductView = Boolean(selectedProductSheet);

  const tableSnapshot = {
    ...selectedSheet,
    generatedAt: result.snapshot.generatedAt,
    sourceFile: result.snapshot.sourceFile
  };

  return (
    <main className="page-shell page-shell-wide">
      <section className="tam-header">
        <div>
          <p className="eyebrow">Data Source</p>
          <h1>Total Addressable Market</h1>
          <p>
            Snapshot file: <code>{result.snapshot.sourceFile}</code>
          </p>
          <div className="sheet-groups">
            {substratesSheet ? (
              <section className="sheet-group">
                <p className="sheet-group-title">Substrates</p>
                <div className="tab-nav">
                  <Link
                    href={`/tam?sheet=${encodeURIComponent(substratesSheet.name)}`}
                    className={`tab-link ${substratesSheet.name === selectedSheet.name ? "active" : ""}`}
                  >
                    {substratesSheet.name}
                  </Link>
                </div>
              </section>
            ) : null}
            {materialSheets.length > 0 ? (
              <section className="sheet-group">
                <p className="sheet-group-title">Materials</p>
                <div className="tab-nav">
                  {materialSheets.map((sheet) => (
                    <Link
                      key={sheet.name}
                      href={`/tam?sheet=${encodeURIComponent(sheet.name)}`}
                      className={`tab-link ${sheet.name === selectedSheet.name ? "active" : ""}`}
                    >
                      {sheet.name}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {productSheets.length > 0 ? (
              <ProductMachineGroups
                datasetId="tam"
                productSheetsByMachine={productSheetsByMachine}
                selectedProductQueryKey={selectedProductSheet?.queryKey}
              />
            ) : null}
          </div>
        </div>
        <Link href="/" className="secondary-link">
          Home
        </Link>
      </section>
      <TamTable
        datasetId="tam"
        snapshot={tableSnapshot}
        readOnly={isProductView}
        productCategoryToQueryKey={productCategoryToQueryKey}
      />
    </main>
  );
}

function toQueryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return undefined;
}
