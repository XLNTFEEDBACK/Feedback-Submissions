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
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative overflow-hidden bg-[var(--surface-darkest)] py-16"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, delay: 0.05 }}
            className="text-5xl font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]"
          >
            Submit Your Track
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.1 }}
            className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)]"
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
