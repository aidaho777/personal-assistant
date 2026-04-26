import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import SettingsForm from "./SettingsForm";
import GoogleDriveLink from "./GoogleDriveLink";

const { webUsers } = schema;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({ id: webUsers.id, email: webUsers.email, name: webUsers.name, createdAt: webUsers.createdAt, telegramUserId: webUsers.telegramUserId, passwordHash: webUsers.passwordHash })
    .from(webUsers)
    .where(eq(webUsers.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>
      <div className="max-w-2xl space-y-6">

        {/* Profile card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Профиль</h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 mb-6">
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-slate-500">Email</span>
              <span className="text-slate-900 dark:text-white">{user.email}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-slate-500">Дата регистрации</span>
              <span className="text-slate-900 dark:text-white">
                {user.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-slate-500">Telegram</span>
              <span className={user.telegramUserId ? "text-green-500" : "text-slate-500"}>
                {user.telegramUserId ? "Привязан" : "Не привязан"}
              </span>
            </div>
          </div>
          <SettingsForm initialName={user.name ?? ""} hasPassword={!!user.passwordHash} />
        </div>

        {/* Google Drive */}
        <Suspense fallback={<div className="text-slate-400 text-sm animate-pulse p-6">Загрузка...</div>}>
          <GoogleDriveLink />
        </Suspense>

        {/* Telegram link */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Привязка Telegram</h2>
          <p className="text-sm text-slate-500 mb-4">
            Свяжите свой веб-аккаунт с Telegram-ботом, чтобы видеть историю загрузок.
          </p>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-sm font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Отправьте команду <span className="text-blue-500 font-semibold">/link</span> боту в Telegram.
          </div>
          <p className="text-xs text-slate-400 mt-2">Функция будет доступна в следующем обновлении.</p>
        </div>

      </div>
    </div>
  );
}
