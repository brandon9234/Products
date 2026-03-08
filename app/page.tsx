import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-card">
        <p className="eyebrow">Products</p>
        <h1>TAM Snapshot Viewer</h1>
        <p>
          Browse and edit TAM datasets from committed snapshots with separate tabs for each
          source workbook.
        </p>
        <div className="home-actions">
          <Link href="/tam" className="primary-link">
            Open TAM 1
          </Link>
          <Link href="/tam-2" className="secondary-link">
            Open TAM 2
          </Link>
        </div>
      </section>
    </main>
  );
}
