import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Player",
};

export default function PlayerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
