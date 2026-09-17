/**
 * Application shell.
 *
 * M0 (task 1.1) is the scaffold only: this renders the static shell so `npm run build`
 * has a real entry point. The 3D viewer lands in M0 task 1.4, and the navigation /
 * spec-sheet panels land in M1e (tasks 4.5-4.7).
 */
export function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">3D Cell Anatomy Explorer</h1>
        <p className="app__subtitle">Animal cell vs. plant cell, modelled procedurally in the browser.</p>
      </header>
      <p className="app__note">Scaffold only. The cell viewer arrives in M0 task 1.4.</p>
    </main>
  );
}
