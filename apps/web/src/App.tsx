export function App() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="app-title">
        <p className="eyebrow">Build Wave 0</p>
        <h1 id="app-title">Technical Learning Platform</h1>
        <p>
          The application foundation is active. Architecture is frozen for MVP
          implementation and the next build target is Platform Kernel and
          Authentication.
        </p>
        <dl className="status-grid">
          <div>
            <dt>Application</dt>
            <dd>Web shell online</dd>
          </div>
          <div>
            <dt>Architecture</dt>
            <dd>Frozen for MVP</dd>
          </div>
          <div>
            <dt>Current Wave</dt>
            <dd>Wave 0 — Engineering Foundation</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
