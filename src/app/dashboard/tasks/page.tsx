import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<div className="text-slate-400 p-6 animate-pulse">Загрузка...</div>}>
      <TasksClient />
    </Suspense>
  );
}
