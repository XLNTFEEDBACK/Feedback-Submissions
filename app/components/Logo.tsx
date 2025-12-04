"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

const YOUTUBE_URL = "https://www.youtube.com/@xlntsound";
const LOGO_IMAGE_PATH = "/XLNT Logo WHITE 02.png";

export default function Logo() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-4 left-4 z-10"
    >
      <Link
        href={YOUTUBE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative inline-block"
        aria-label="Visit XLNT Sound YouTube Channel"
      >
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative"
        >
          {/* Logo Image */}
          <div className="relative h-10 w-auto transition-opacity duration-300 group-hover:opacity-90">
            <Image
              src={LOGO_IMAGE_PATH}
              alt="XLNT Logo"
              width={150}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
          
          {/* Hover glow effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-cyan)]/0 via-[var(--accent-cyan)]/20 to-[var(--accent-cyan)]/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 blur-sm pointer-events-none" />
        </motion.div>
      </Link>
    </motion.div>
  );
}

