import { redirect } from "next/navigation";

export default function HabitsPage() {
  redirect("/goals?tab=habits");
}
