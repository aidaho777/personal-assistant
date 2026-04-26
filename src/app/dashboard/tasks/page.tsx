import { auth } from "@/auth";
import { redirect } from "next/navigation";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <TasksClient />;
}
