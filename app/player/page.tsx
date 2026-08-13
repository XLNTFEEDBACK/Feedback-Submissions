import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AdminPlayer from "./AdminPlayer";

export default async function PlayerPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=%2Fplayer");
  }

  if (!session.user?.isAdmin) {
    redirect("/queue?player=unauthorized");
  }

  return <AdminPlayer />;
}
