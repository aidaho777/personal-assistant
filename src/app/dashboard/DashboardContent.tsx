import { db, schema } from "@/db";
import { eq, gte, sql, and, desc } from "drizzle-orm";
import dynamic from "next/dynamic";

const UploadsChart = dynamic(() => import("./UploadsChart"), { ssr: false });

const { uploads } = schema;

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function typeIcon(t: string) {
  return t === "photo" ? "🖼️" : t === "voice" ? "🎤" : t === "text" ? "📝" : "📄";
}

async function getStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 6 * 86400_000);
  const monthStart = new Date(todayStart.getTime() - 29 * 86400_000);

  const [total, today, week, volumeRow, tags, recent, chartRows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.status, "success")).then(r => r[0]?.c ?? 0),
    db.select({ c: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.status, "success"), gte(uploads.createdAt, todayStart))).then(r => r[0]?.c ?? 0),
    db.select({ c: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.status, "success"), gte(uploads.createdAt, weekStart))).then(r => r[0]?.c ?? 0),
    db.select({ v: sql<string>`coalesce(sum(file_size)::bigint, 0)::text` }).from(uploads).where(eq(uploads.status, "success")).then(r => Number(r[0]?.v ?? 0)),
    db.select({ tag: uploads.tag, c: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.status, "success")).groupBy(uploads.tag).orderBy(sql`count(*) desc`).limit(5),
    db.select().from(uploads).where(eq(uploads.status, "success")).orderBy(desc(uploads.createdAt)).limit(10),
    db.select({ date: sql<string>`date_trunc('day', created_at)::date::text`, count: sql<number>`count(*)::int` })
      .from(uploads).where(and(eq(uploads.status, "success"), gte(uploads.createdAt, monthStart)))
      .groupBy(sql`date_trunc('day', created_at)`).orderBy(sql`date_trunc('day', created_at)`),
  ]);

  const chartMap = new Map(chartRows.map(r => [r.date, r.count]));
  const chart: { date: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(monthStart.getTime() + i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    chart.push({ date: key, count: chartMap.get(key) ?? 0 });
  }

  return { total, today, week, totalBytes: volumeRow, tags, recent, chart };
}

export default async function DashboardContent() {
  const { total, today, week, totalBytes, tags, recent, chart } = await getStats();

  const statCards = [
    { label: "Всего файлов",    value: total,           icon: "📦" },
    { label: "За сегодня",      value: today,           icon: "📅" },
    { label: "За 7 дней",       value: week,            icon: "📆" },
    { label: "Объём данных",    value: fmtBytes(totalBytes), icon: "💾" },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
            <div className="text-sm text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Загрузки за 30 дней</h2>
          <UploadsChart data={chart} />
        </div>

        {/* Top tags */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Топ-5 тегов</h2>
          <div className="space-y-3">
            {tags.length === 0 && <p className="text-slate-500 text-sm">Нет данных</p>}
            {tags.map(({ tag, c }, i) => {
              const max = tags[0]?.c ?? 1;
              return (
                <div key={tag}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">#{tag}</span>
                    <span className="text-slate-500">{c}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.round((c / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent uploads */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Последние загрузки</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="pb-2 pr-4 font-medium">Дата</th>
                <th className="pb-2 pr-4 font-medium">Файл</th>
                <th className="pb-2 pr-4 font-medium">Тег</th>
                <th className="pb-2 pr-4 font-medium">Тип</th>
                <th className="pb-2 pr-4 font-medium">Размер</th>
                <th className="pb-2 font-medium">Drive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {recent.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-500">Нет загрузок</td></tr>
              )}
              {recent.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="py-2 pr-4 text-slate-900 dark:text-white max-w-[200px] truncate" title={u.fileName}>{u.fileName}</td>
                  <td className="py-2 pr-4"><span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">#{u.tag}</span></td>
                  <td className="py-2 pr-4 text-slate-500">{typeIcon(u.contentType)} {u.contentType}</td>
                  <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{u.fileSize ? fmtBytes(u.fileSize) : "—"}</td>
                  <td className="py-2">
                    {u.driveUrl ? (
                      <a href={u.driveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">
                        Открыть ↗
                      </a>
                    ) : "—"}
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
