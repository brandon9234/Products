import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-card">
        <p className="eyebrow">Products</p>
        <h1>TAM Snapshot Viewer</h1>
        <p>
          Browse and edit the TAM snapshot with a separate substrate overview and
          material-specific sheets.
        </p>
        <div className="home-actions">
          <Link href="/tam" className="primary-link">
            Open TAM
          </Link>
        </div>
      </section>
    </main>
  );
}
