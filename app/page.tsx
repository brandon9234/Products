import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-card">
        <p className="eyebrow">Products</p>
        <h1>TAM Snapshot Viewer</h1>
        <p>
          Import your latest TAM spreadsheet into <code>data/tam.snapshot.json</code> and
          browse it in the internal UI.
        </p>
        <div className="home-actions">
          <Link href="/tam" className="primary-link">
            Open TAM table
          </Link>
        </div>
      </section>
    </main>
  );
}

