// app/page.tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  // Automatically redirect the root URL to the submission page
  redirect("/submit");
}

