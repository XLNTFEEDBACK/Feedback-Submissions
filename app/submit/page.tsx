"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import SubmissionForm from "../components/SubmissionForm";
import Link from "next/link";
import type { SVGProps } from "react";

// ============================================================================
// SOCIAL MEDIA LINKS CONFIGURATION
// ============================================================================
// Update the URLs below with your actual social media links:
const SOCIAL_LINKS = {
  tiktok: "https://www.tiktok.com/@xlntsound", // TODO: Replace with your TikTok URL
  instagram: "https://www.instagram.com/xlntsound", // TODO: Replace with your Instagram URL
  youtube: "https://www.youtube.com/@xlntsound", // TODO: Replace with your YouTube URL
  patreon: "https://www.patreon.com/xlntsound", // TODO: Replace with your Patreon URL
  spotifyPodcast: "https://open.spotify.com/show/5Tq6mDpe4HsMavswgPwMGo?si=SPweOWJ4Q6WdxkEzEQSpSQ", // TODO: Replace with your Spotify Podcast URL
  xlntStore: "https://xlntsound.com", // TODO: Replace with your XLNT Sound Store URL
};
// ============================================================================

// Social Media Icons
const TIKTOK_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M15 5c-1.2 0-2.3-.4-3.2-1.1v6.3c0 3-2.4 5.3-5.4 5.3A5.3 5.3 0 0 1 1 10.2c0-2.9 2.3-5.2 5.2-5.3v2.7c-1 .1-1.8.9-1.8 1.9 0 1.1.9 2 2 2 1.1 0 2-.9 2-2V0h2.2c.2 1.7 1.6 3 3.4 3V5z" />
  </svg>
);

const INSTAGRAM_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 7.4a2.9 2.9 0 1 1 0-5.8 2.9 2.9 0 0 1 0 5.8z" />
    <path d="M12.5 1h-9A2.5 2.5 0 0 0 1 3.5v9A2.5 2.5 0 0 0 3.5 15h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 12.5 1zm1 11.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9z" />
    <circle cx="12.1" cy="3.9" r=".9" />
  </svg>
);

const YOUTUBE_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M15.32 4.06c-.434-.772-.905-.914-1.864-.967C12.498 3.03 10.089 3 8.002 3c-2.137 0-4.146.03-5.577.113-.86.053-1.33.194-1.864.967-.31.577-.31 1.936-.31 3.935v.12c0 1.999 0 3.358.31 3.935.434.772.905.914 1.864.967C3.856 12.97 5.865 13 8.002 13c2.137 0 4.146-.03 5.577-.113.86-.053 1.33-.194 1.864-.967.31-.577.31-1.936.31-3.935v-.12c0-1.999 0-3.358-.31-3.935zM6 10V6l5 2-5 2z" />
  </svg>
);

const PATREON_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M10.5 2C7.468 2 5 4.468 5 7.5S7.468 13 10.5 13 16 10.532 16 7.5 13.532 2 10.5 2zM2 2v12h2V2H2z" />
  </svg>
);

const SPOTIFY_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.68 11.54c-.16 0-.32-.08-.4-.24-1.12-.96-2.56-1.48-4.08-1.48-.72 0-1.44.08-2.12.24-.24.08-.48-.08-.56-.32-.08-.24.08-.48.32-.56.8-.16 1.6-.24 2.4-.24 1.68 0 3.28.56 4.56 1.6.2.16.24.44.08.64-.08.16-.24.24-.4.24zm.56-2.24c-.2 0-.36-.08-.48-.28-1.24-1.08-2.84-1.68-4.52-1.68-.8 0-1.6.12-2.32.32-.28.08-.56-.08-.64-.36-.08-.28.08-.56.36-.64.84-.24 1.72-.36 2.6-.36 1.88 0 3.68.68 5.08 1.92.24.2.28.52.08.76-.12.16-.28.32-.48.32zm.64-2.4c-.24 0-.44-.12-.56-.32-1.4-1.2-3.16-1.88-4.96-1.88-.92 0-1.84.12-2.68.36-.32.08-.64-.12-.72-.44-.08-.32.12-.64.44-.72.96-.28 1.96-.4 2.96-.4 2.04 0 4 .76 5.56 2.12.24.2.28.56.08.8-.12.2-.32.32-.56.32z" />
  </svg>
);

const STORE_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M3 3.5C3 2.67 3.67 2 4.5 2h7c.83 0 1.5.67 1.5 1.5V4h1c.55 0 1 .45 1 1v9c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h1v-.5zM4.5 3a.5.5 0 0 0-.5.5V4h8v-.5a.5.5 0 0 0-.5-.5h-7zM2 5v9h12V5H2z" />
  </svg>
);

// Tooltip wrapper component
const TooltipWrapper = ({ children, tooltip }: { children: React.ReactNode; tooltip: string }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setShowTooltip(true);
    }, 1000);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setShowTooltip(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {showTooltip && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2 }}
          className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm border border-white/10"
        >
          {tooltip}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-black/90 border-l border-t border-white/10" />
        </motion.div>
      )}
    </div>
  );
};

export default function SubmitPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[var(--surface-void)] text-white pt-20">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className={`relative mx-auto flex w-full max-w-2xl flex-col items-center gap-2 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] p-12 text-center shadow-[0_40px_120px_-40px_rgba(0,229,255,0.4)] transition-all duration-300 ${
          isModalOpen ? "opacity-30 blur-sm" : "opacity-100"
        }`}
      >
        {/* Accent glow lines */}
        <div className="absolute top-0 left-1/3 w-40 h-1 bg-gradient-to-r from-transparent via-[var(--accent-magenta)] to-transparent opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-32 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-60" />

        <h1 className="text-5xl font-black uppercase tracking-[0.4em] text-white drop-shadow-[0_2px_10px_rgba(0,229,255,0.3)]">
          XLNT Feedback Form
        </h1>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
          Share Your Sound • Join the Queue
        </p>
        
        {/* Social Links */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {SOCIAL_LINKS.tiktok && (
            <TooltipWrapper tooltip="Visit TikTok">
              <motion.a
                href={SOCIAL_LINKS.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="TikTok"
              >
                <TIKTOK_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.instagram && (
            <TooltipWrapper tooltip="Visit Instagram">
              <motion.a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="Instagram"
              >
                <INSTAGRAM_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.youtube && (
            <TooltipWrapper tooltip="Visit YouTube">
              <motion.a
                href={SOCIAL_LINKS.youtube}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="YouTube"
              >
                <YOUTUBE_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.patreon && (
            <TooltipWrapper tooltip="Support on Patreon">
              <motion.a
                href={SOCIAL_LINKS.patreon}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="Patreon"
              >
                <PATREON_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.spotifyPodcast && (
            <TooltipWrapper tooltip="Listen on Spotify">
              <motion.a
                href={SOCIAL_LINKS.spotifyPodcast}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="Spotify Podcast"
              >
                <SPOTIFY_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.xlntStore && (
            <TooltipWrapper tooltip="Visit XLNT Store">
              <motion.a
                href={SOCIAL_LINKS.xlntStore}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/60 transition-colors duration-300 hover:text-white"
                aria-label="XLNT Sound Store"
              >
                <STORE_ICON className="h-5 w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
        </div>
      </motion.header>

      {/* Form Container */}
      <main className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-6 px-4 py-8">
        <SubmissionForm onModalStateChange={setIsModalOpen} />
      </main>
    </div>
  );
}
