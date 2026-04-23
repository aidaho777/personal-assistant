import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AARRRContent from "./AARRRContent";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Analytics</h1>
      <Suspense fallback={<div className="text-slate-400">Загрузка...</div>}>
        <AARRRContent />
      </Suspense>
    </div>
  );
}
