import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SidebarClient from "./SidebarClient";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      <SidebarClient user={{ name: session.user.name, email: session.user.email, image: session.user.image }} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
