import { db, schema } from "@/db";
import { gte, sql, and, isNotNull } from "drizzle-orm";
import FunnelChart from "./FunnelChart";

const { webUsers, uploads } = schema;

async function getFunnel(since: Date | null) {
  const userFilter = since ? and(gte(webUsers.createdAt, since)) : undefined;

  const [registered, linked, firstUpload, active, power] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(webUsers).where(userFilter).then(r => r[0]?.c ?? 0),
    db.select({ c: sql<number>`count(*)::int` }).from(webUsers)
      .where(userFilter ? and(userFilter, isNotNull(webUsers.telegramUserId)) : isNotNull(webUsers.telegramUserId))
      .then(r => r[0]?.c ?? 0),
    db.select({ c: sql<number>`count(distinct user_id)::int` }).from(uploads).then(r => r[0]?.c ?? 0),
    db.execute(sql`SELECT count(*)::int AS c FROM (SELECT user_id FROM uploads GROUP BY user_id HAVING count(*) >= 5) AS active_users`)
      .then((r: any) => Number(r.rows?.[0]?.c ?? r[0]?.c ?? 0)),
    db.execute(sql`SELECT count(*)::int AS c FROM (SELECT user_id FROM uploads GROUP BY user_id HAVING count(*) >= 20) AS power_users`)
      .then((r: any) => Number(r.rows?.[0]?.c ?? r[0]?.c ?? 0)),
  ]);

  const values = [registered, linked, firstUpload, active, power];
  const labels = ["Регистрация", "Привязан Telegram", "Первая загрузка", "Активные (5+)", "Power users (20+)"];

  return labels.map((label, i) => ({
    step: i + 1,
    label,
    value: values[i],
    conversion: registered > 0 ? Math.round((values[i] / registered) * 100) : 0,
    stepConversion: i === 0 ? 100 : values[i - 1] > 0 ? Math.round((values[i] / values[i - 1]) * 100) : 0,
  }));
}

export default async function FunnelContent() {
  const funnel = await getFunnel(null);

  return (
    <div className="space-y-6">
      {/* Funnel bars */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-6">Воронка использования</h2>
        <FunnelChart data={funnel} />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Детальная таблица</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="pb-2 pr-6 font-medium">#</th>
                <th className="pb-2 pr-6 font-medium">Шаг</th>
                <th className="pb-2 pr-6 font-medium text-right">Пользователей</th>
                <th className="pb-2 pr-6 font-medium text-right">От старта</th>
                <th className="pb-2 font-medium text-right">Шаг к шагу</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {funnel.map(row => (
                <tr key={row.step} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="py-3 pr-6 text-slate-500">{row.step}</td>
                  <td className="py-3 pr-6 text-slate-900 dark:text-white font-medium">{row.label}</td>
                  <td className="py-3 pr-6 text-right font-mono text-slate-900 dark:text-white">{row.value}</td>
                  <td className="py-3 pr-6 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.conversion > 50 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                      {row.conversion}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.stepConversion === 100 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : row.stepConversion > 50 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {row.stepConversion}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
