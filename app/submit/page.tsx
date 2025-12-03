"use client";
import { motion } from "framer-motion";
import SubmissionForm from "../components/SubmissionForm";

export default function SubmitPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--surface-void)] text-white">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="relative overflow-hidden bg-gradient-to-b from-black/80 via-[var(--surface-dark)]/60 to-transparent py-16"
      >
        {/* Accent glow lines */}
        <div className="absolute top-0 left-1/3 w-40 h-1 bg-gradient-to-r from-transparent via-[var(--accent-magenta)] to-transparent opacity-60" />
        <div className="absolute bottom-0 right-1/3 w-32 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-60" />

        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl font-black uppercase tracking-[0.4em] text-white drop-shadow-[0_2px_20px_rgba(255,0,170,0.4)]"
          >
            Submit Your Track
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50"
          >
            Share Your Sound • Join the Queue
          </motion.p>
        </div>
      </motion.header>

      {/* Form Container */}
      <main className="px-4 pb-20">
        <SubmissionForm />
      </main>
    </div>
  );
}
