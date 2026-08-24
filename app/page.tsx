import Link from "next/link";

const journey = [
  {
    number: "01",
    title: "Follow",
    description: "Choose the football teams and competitions that matter to you.",
  },
  {
    number: "02",
    title: "Discover",
    description: "Find eligible watch events connected to a fixture and an Israel city.",
  },
  {
    number: "03",
    title: "Request or join",
    description: "Ask for a place or accept a direct invitation through a controlled flow.",
  },
  {
    number: "04",
    title: "Host and manage",
    description: "Create a gathering and manage attendance without exposing private details early.",
  },
] as const;

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#17211b]">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#c8e2bb]/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#f4c991]/45 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-[#17211b]/15 py-6">
          <Link className="inline-flex items-center gap-3" href="/" aria-label="Huddle home">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full bg-[#173f2a] text-sm font-bold text-[#f8f4e9]"
            >
              H
            </span>
            <span className="text-xl font-semibold tracking-[-0.03em]">Huddle</span>
          </Link>

          <span className="rounded-full border border-[#173f2a]/25 bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#27573c]">
            Under development
          </span>
        </header>

        <section className="grid flex-1 items-center gap-14 py-20 lg:grid-cols-[1.3fr_0.7fr] lg:py-28">
          <div>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#3e694d]">
              Israel pilot · Football first
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[5.8rem]">
              Match day is better together.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#425148] sm:text-xl">
              Huddle will help sports fans follow their interests, discover suitable nearby watch
              events, and join or host them through clear attendance and privacy boundaries.
            </p>
          </div>

          <aside className="rounded-[2rem] border border-[#173f2a]/15 bg-[#173f2a] p-8 text-[#f8f4e9] shadow-[0_24px_80px_rgba(23,63,42,0.18)] sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b9d9bd]">
              Foundation status
            </p>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">
              The groundwork comes first.
            </h2>
            <p className="mt-5 leading-7 text-[#d8e6d8]">
              We are establishing the application, database, authorization, and test foundations
              before opening accounts or publishing events.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-5 border-t border-white/15 pt-7 text-sm">
              <div>
                <dt className="text-[#a9c8ae]">Interface</dt>
                <dd className="mt-1 font-semibold">English</dd>
              </div>
              <div>
                <dt className="text-[#a9c8ae]">Display time</dt>
                <dd className="mt-1 font-semibold">Jerusalem</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section aria-labelledby="journey-heading" className="border-t border-[#17211b]/15 py-12">
          <h2 id="journey-heading" className="sr-only">
            The Huddle journey
          </h2>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {journey.map((step) => (
              <li key={step.number} className="border-l border-[#173f2a]/25 pl-5">
                <span className="text-xs font-bold tracking-[0.18em] text-[#4c7657]">
                  {step.number}
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#566159]">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#17211b]/15 py-6 text-sm text-[#667168] sm:flex-row sm:items-center sm:justify-between">
          <p>Huddle · Israel pilot</p>
          <p>One account, one attendee.</p>
        </footer>
      </div>
    </main>
  );
}
