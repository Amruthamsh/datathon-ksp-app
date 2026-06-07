import "./App.css";

const metrics = [
  { value: "01", label: "Fresh Vite scaffold" },
  { value: "02", label: "React 19 + TypeScript" },
  { value: "03", label: "Catalyst-ready structure" },
];

const stack = ["Vite", "React", "TypeScript", "Catalyst"];

function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Datathon KSP</p>
          <h1>Fast client bootstrap, rebuilt on Vite.</h1>
          <p className="lede">
            The old Create React App scaffold has been replaced with a lean,
            modern starter that is easier to maintain, faster to run, and ready
            for future UI work.
          </p>

          <div className="actions">
            <a className="primary-button" href="https://vite.dev/guide/">
              Vite guide
            </a>
            <a className="secondary-button" href="https://react.dev/learn">
              React docs
            </a>
          </div>
        </div>

        <aside className="info-panel">
          <div className="panel-header">
            <span>Current stack</span>
            <span>Ready</span>
          </div>
          <ul className="stack-list">
            {stack.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
