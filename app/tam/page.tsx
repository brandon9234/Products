import Link from "next/link";

import { loadTamSnapshot } from "@/src/lib/tam/loadSnapshot";

import { TamTable } from "./tam-table";

export default async function TamPage() {
  const result = await loadTamSnapshot();

  if (result.status === "missing") {
    return (
      <main className="page-shell">
        <section className="message-card">
          <h1>TAM Snapshot Not Found</h1>
          <p>
            Create <code>data/tam.snapshot.json</code> by running:
          </p>
          <pre>
            <code>npm run import:tam -- --input "data/raw/tam.xlsx" --sheet TAM</code>
          </pre>
          <p>
            If your export is CSV, use <code>--input "data/raw/tam.csv"</code>.
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
          <h1>TAM Snapshot Is Malformed</h1>
          <p>
            <strong>Path:</strong> <code>{result.snapshotPath}</code>
          </p>
          <p>
            <strong>Error:</strong> {result.error}
          </p>
          <p>Re-run import to regenerate a clean snapshot.</p>
          <pre>
            <code>npm run import:tam -- --input "data/raw/tam.xlsx" --sheet TAM</code>
          </pre>
          <Link href="/" className="secondary-link">
            Back to home
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="tam-header">
        <div>
          <p className="eyebrow">Data Source</p>
          <h1>Total Addressable Market</h1>
          <p>
            Snapshot file: <code>{result.snapshot.sourceFile}</code>
          </p>
        </div>
        <Link href="/" className="secondary-link">
          Home
        </Link>
      </section>
      <TamTable snapshot={result.snapshot} />
    </main>
  );
}

