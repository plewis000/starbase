import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/ui/AppShell";

export const metadata = {
  title: "Shopping - Starbase",
  description: "Manage your shopping lists",
};

export default async function ShoppingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userData = {
    full_name: user.user_metadata?.full_name ?? user.email ?? "User",
    email: user.email ?? "",
    avatar_url: user.user_metadata?.avatar_url ?? undefined,
  };

  return <AppShell user={userData}>{children}</AppShell>;
}
