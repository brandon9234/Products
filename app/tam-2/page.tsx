import Link from "next/link";
import path from "node:path";

import { loadTamSnapshot } from "@/src/lib/tam/loadSnapshot";
import { TamTable } from "@/app/tam/tam-table";

const TAM_2_SNAPSHOT_PATH = path.join(process.cwd(), "data", "tam-2.snapshot.json");

interface TamSecondPageProps {
  searchParams?: {
    sheet?: string | string[];
  };
}

export default async function TamSecondPage({ searchParams }: TamSecondPageProps) {
  const result = await loadTamSnapshot(TAM_2_SNAPSHOT_PATH);

  if (result.status === "missing") {
    return (
      <main className="page-shell">
        <section className="message-card">
          <div className="tab-nav">
            <Link href="/tam" className="tab-link">
              TAM 1
            </Link>
            <Link href="/tam-2" className="tab-link active">
              TAM 2
            </Link>
          </div>
          <h1>TAM 2 Snapshot Not Found</h1>
          <p>
            Create <code>{TAM_2_SNAPSHOT_PATH}</code> by running:
          </p>
          <pre>
            <code>
              npm run import:tam -- --input "data/raw/tam-2.xlsx" --sheet TAM --output
              "data/tam-2.snapshot.json"
            </code>
          </pre>
          <p>
            If your export is CSV, use <code>--input "data/raw/tam-2.csv"</code>.
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
      <main className="page-shell">
        <section className="message-card">
          <div className="tab-nav">
            <Link href="/tam" className="tab-link">
              TAM 1
            </Link>
            <Link href="/tam-2" className="tab-link active">
              TAM 2
            </Link>
          </div>
          <h1>TAM 2 Snapshot Is Malformed</h1>
          <p>
            <strong>Path:</strong> <code>{result.snapshotPath}</code>
          </p>
          <p>
            <strong>Error:</strong> {result.error}
          </p>
          <p>Re-run import to regenerate a clean snapshot.</p>
          <pre>
            <code>
              npm run import:tam -- --input "data/raw/tam-2.xlsx" --sheet TAM --output
              "data/tam-2.snapshot.json"
            </code>
          </pre>
          <Link href="/" className="secondary-link">
            Back to home
          </Link>
        </section>
      </main>
    );
  }

  const requestedSheet = toQueryValue(searchParams?.sheet);
  const selectedSheet =
    result.snapshot.sheets.find((sheet) => sheet.name === requestedSheet) ??
    result.snapshot.sheets.find((sheet) => sheet.name === result.snapshot.defaultSheet) ??
    result.snapshot.sheets[0] ?? {
      name: "TAM",
      columns: [],
      rows: [],
      rowCount: 0
    };

  const tableSnapshot = {
    ...selectedSheet,
    generatedAt: result.snapshot.generatedAt,
    sourceFile: result.snapshot.sourceFile
  };

  return (
    <main className="page-shell">
      <section className="tam-header">
        <div>
          <p className="eyebrow">Data Source</p>
          <h1>Total Addressable Market - TAM 2</h1>
          <p>
            Snapshot file: <code>{result.snapshot.sourceFile}</code>
          </p>
          <div className="tab-nav">
            <Link href="/tam" className="tab-link">
              TAM 1
            </Link>
            <Link href="/tam-2" className="tab-link active">
              TAM 2
            </Link>
          </div>
          <div className="tab-nav">
            {result.snapshot.sheets.map((sheet) => (
              <Link
                key={sheet.name}
                href={`/tam-2?sheet=${encodeURIComponent(sheet.name)}`}
                className={`tab-link ${sheet.name === selectedSheet.name ? "active" : ""}`}
              >
                {sheet.name}
              </Link>
            ))}
          </div>
        </div>
        <Link href="/" className="secondary-link">
          Home
        </Link>
      </section>
      <TamTable datasetId="tam-2" snapshot={tableSnapshot} />
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
