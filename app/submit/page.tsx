import SubmissionForm from "../components/SubmissionForm";

export default function SubmitPage() {
  return (
    <div className="min-h-screen w-full bg-[#050407] text-white">
      <header className="bg-black/80 py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3">
          <h1 className="text-4xl font-black uppercase text-white">
            Submit Your Track
          </h1>
          <p className="text-sm uppercase tracking-[0.25em] text-white/60">
            share your sound • join the queue
          </p>
        </div>
      </header>
      <main className="px-4 pb-16">
        <SubmissionForm />
      </main>
    </div>
  );
}
