"use client";
import { motion } from "framer-motion";
import SubmissionForm from "../components/SubmissionForm";

export default function SubmitPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--surface-void)] text-white pt-20">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-2 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] p-12 text-center shadow-[0_40px_120px_-40px_rgba(0,229,255,0.4)]"
      >
        {/* Accent glow lines */}
        <div className="absolute top-0 left-1/3 w-40 h-1 bg-gradient-to-r from-transparent via-[var(--accent-magenta)] to-transparent opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-32 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-60" />

        <h1 className="text-5xl font-black uppercase tracking-[0.4em] text-white drop-shadow-[0_2px_10px_rgba(0,229,255,0.3)]">
          Submission Form
        </h1>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
          Share Your Sound • Join the Queue
        </p>
      </motion.header>

      {/* Form Container */}
      <main className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-6 px-4 py-8">
        <SubmissionForm />
      </main>
    </div>
  );
}
