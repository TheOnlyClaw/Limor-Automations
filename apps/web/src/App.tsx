export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="font-semibold tracking-tight">Limor Automations</div>
          <nav className="flex items-center gap-2 text-sm text-zinc-300">
            <a className="rounded-md px-3 py-1.5 hover:bg-zinc-900 hover:text-zinc-100" href="#">
              Dashboard
            </a>
            <a className="rounded-md px-3 py-1.5 hover:bg-zinc-900 hover:text-zinc-100" href="#">
              Runs
            </a>
            <a className="rounded-md px-3 py-1.5 hover:bg-zinc-900 hover:text-zinc-100" href="#">
              Settings
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
          <h1 className="text-2xl font-semibold tracking-tight">Modern, minimal stack</h1>
          <p className="mt-2 text-zinc-300">
            Fastify backend + React/Tailwind frontend. Specs live in <code className="rounded bg-zinc-900 px-1.5 py-0.5">/openspec</code>.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100">
              Create automation
            </button>
            <button className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900">
              View specs
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { title: 'Fastify API', desc: 'Typed TS server with simple routes.' },
              { title: 'React UI', desc: 'Vite + Tailwind + clean layout baseline.' },
              { title: 'OpenSpec', desc: 'Specs-first workflow for changes.' },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-sm font-semibold">{c.title}</div>
                <div className="mt-1 text-sm text-zinc-300">{c.desc}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
