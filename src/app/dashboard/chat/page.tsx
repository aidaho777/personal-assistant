import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ChatClient from "./ChatClient";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">AI Chat</h1>
      <ChatClient />
    </div>
  );
}
