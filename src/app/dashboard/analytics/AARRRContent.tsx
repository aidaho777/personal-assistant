import { db } from "@/db";
import { sql } from "drizzle-orm";

// ─── Data fetching ──────────────────────────────────────────────────────────

async function getAARRRData() {
  const now = new Date();
  // Build ISO date strings and embed directly into SQL to avoid Drizzle serialization issues
  const d7  = new Date(now.getTime() - 7  * 86400_000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const d60 = new Date(now.getTime() - 60 * 86400_000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Helper: run a raw SQL query and return first row's numeric field "c"
  const count = async (rawSql: string): Promise<number> => {
    const r: any = await db.execute(sql.raw(rawSql));
    return Number(r.rows?.[0]?.c ?? r[0]?.c ?? 0);
  };

  const rows = async <T>(rawSql: string): Promise<T[]> => {
    const r: any = await db.execute(sql.raw(rawSql));
    return (r.rows ?? r) as T[];
  };

  const [
    totalWebUsers,
    newUsersLast7,
    newUsersLast30,
    newUsersPrev30,
    totalTelegramUsers,
    activatedUsers,
    usersWithFirstUpload,
    activeUsersLast7,
    activeUsersLast30,
    activeUsersPrev30,
    powerUsers,
    totalUploads,
    uploadsLast7,
    uploadsLast30,
    uploadsToday,
    successUploads,
    errorUploads,
    voiceUploads,
    usersLinkedTelegram,
    dailyActivity,
    contentTypes,
    topUsers,
    weeklySignups,
  ] = await Promise.all([
    // Acquisition
    count(`SELECT count(*)::int AS c FROM web_users`),
    count(`SELECT count(*)::int AS c FROM web_users WHERE created_at >= '${d7}'`),
    count(`SELECT count(*)::int AS c FROM web_users WHERE created_at >= '${d30}'`),
    count(`SELECT count(*)::int AS c FROM web_users WHERE created_at >= '${d60}' AND created_at < '${d30}'`),
    count(`SELECT count(*)::int AS c FROM users`),
    // Activation
    count(`SELECT count(*)::int AS c FROM web_users WHERE telegram_user_id IS NOT NULL`),
    count(`SELECT count(distinct user_id)::int AS c FROM uploads`),
    // Retention
    count(`SELECT count(distinct user_id)::int AS c FROM uploads WHERE created_at >= '${d7}'`),
    count(`SELECT count(distinct user_id)::int AS c FROM uploads WHERE created_at >= '${d30}'`),
    count(`SELECT count(distinct user_id)::int AS c FROM uploads WHERE created_at >= '${d60}' AND created_at < '${d30}'`),
    count(`SELECT count(*)::int AS c FROM (SELECT user_id FROM uploads GROUP BY user_id HAVING count(*) >= 20) t`),
    // Revenue proxy
    count(`SELECT count(*)::int AS c FROM uploads`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE created_at >= '${d7}'`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE created_at >= '${d30}'`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE created_at >= '${todayStart}'`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE status = 'success'`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE status = 'error'`),
    count(`SELECT count(*)::int AS c FROM uploads WHERE content_type = 'voice'`),
    // Referral
    count(`SELECT count(*)::int AS c FROM web_users WHERE telegram_user_id IS NOT NULL`),
    // Daily activity last 30 days
    rows<{ date: string; count: number }>(`
      SELECT date_trunc('day', created_at)::date::text AS date, count(*)::int AS count
      FROM uploads
      WHERE created_at >= '${d30}'
      GROUP BY 1 ORDER BY 1
    `),
    // Content types
    rows<{ content_type: string; count: number }>(`
      SELECT content_type, count(*)::int AS count
      FROM uploads
      GROUP BY content_type ORDER BY count DESC
    `),
    // Top users
    rows<{ first_name: string; username: string; uploads_count: number; last_active: string }>(`
      SELECT u.first_name, u.username, count(up.id)::int AS uploads_count,
             max(up.created_at)::text AS last_active
      FROM users u
      JOIN uploads up ON up.user_id = u.id
      GROUP BY u.id, u.first_name, u.username
      ORDER BY uploads_count DESC
      LIMIT 5
    `),
    // Weekly signups (last 8 weeks)
    rows<{ week: string; count: number }>(`
      SELECT date_trunc('week', created_at)::date::text AS week, count(*)::int AS count
      FROM web_users
      WHERE created_at >= '${d60}'
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  // Computed metrics
  const activationRate   = totalTelegramUsers > 0 ? Math.round((usersWithFirstUpload / totalTelegramUsers) * 100) : 0;
  const retentionRate7   = totalTelegramUsers > 0 ? Math.round((activeUsersLast7  / totalTelegramUsers) * 100) : 0;
  const retentionRate30  = totalTelegramUsers > 0 ? Math.round((activeUsersLast30 / totalTelegramUsers) * 100) : 0;
  const churnRate        = activeUsersPrev30  > 0 ? Math.round(((activeUsersPrev30 - activeUsersLast30) / activeUsersPrev30) * 100) : 0;
  const successRate      = totalUploads > 0 ? Math.round((successUploads / totalUploads) * 100) : 0;
  const growthRate       = newUsersPrev30 > 0 ? Math.round(((newUsersLast30 - newUsersPrev30) / newUsersPrev30) * 100) : 0;
  const avgUploadsPerUser = totalTelegramUsers > 0 ? (totalUploads / totalTelegramUsers).toFixed(1) : "0";
  const telegramLinkRate = totalWebUsers > 0 ? Math.round((activatedUsers / totalWebUsers) * 100) : 0;

  // Fill daily chart gaps (last 30 days)
  const nowDate  = new Date();
  const dailyMap = new Map(dailyActivity.map(r => [r.date, r.count]));
  const dailyChart: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(nowDate.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    dailyChart.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  return {
    totalWebUsers, newUsersLast7, newUsersLast30, growthRate, totalTelegramUsers,
    activatedUsers, usersWithFirstUpload, activationRate, telegramLinkRate,
    activeUsersLast7, activeUsersLast30, retentionRate7, retentionRate30, churnRate, powerUsers,
    totalUploads, uploadsLast7, uploadsLast30, uploadsToday, successRate, voiceUploads, avgUploadsPerUser,
    usersLinkedTelegram,
    dailyChart, contentTypes, topUsers, weeklySignups,
  };
}

// ─── Helper components ──────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, trend, color = "blue", icon
}: {
  label: string; value: string | number; sub?: string;
  trend?: { value: number; label: string }; color?: string; icon: string;
}) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    green:  "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
    orange: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
    red:    "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    slate:  "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.slate}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.value > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
            : trend.value < 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
          }`}>
            {trend.value > 0 ? "↑" : trend.value < 0 ? "↓" : "→"} {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color = "blue" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const colors: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500",
    orange: "bg-orange-500", red: "bg-red-500", yellow: "bg-yellow-400",
  };
  return (
    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colors[color] ?? "bg-blue-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {badge && (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default async function AARRRContent() {
  const d = await getAARRRData();

  const funnelSteps = [
    { label: "Acquisition", sub: "Посетители зарегистрировались", value: d.totalWebUsers,      icon: "🎯", color: "blue"   },
    { label: "Activation",  sub: "Привязали Telegram-бота",       value: d.activatedUsers,     icon: "⚡", color: "purple" },
    { label: "Revenue",     sub: "Сделали первую загрузку",        value: d.usersWithFirstUpload, icon: "💎", color: "green"  },
    { label: "Retention",   sub: "Активны за 30 дней",            value: d.activeUsersLast30,  icon: "🔄", color: "orange" },
    { label: "Referral",    sub: "Power users (20+ загрузок)",     value: d.powerUsers,         icon: "🚀", color: "red"    },
  ];

  const maxFunnel = d.totalWebUsers || 1;

  const contentTypeIcons: Record<string, string> = {
    document: "📄", photo: "🖼️", voice: "🎤", text: "📝", video: "🎬",
  };

  return (
    <div className="space-y-6">

      {/* ── AARRR Funnel ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <SectionHeader
          title="AARRR Воронка"
          subtitle="Путь пользователя от регистрации до power user"
          badge="AARRR"
        />
        <div className="space-y-3">
          {funnelSteps.map((step, i) => {
            const pct     = Math.round((step.value / maxFunnel) * 100);
            const stepConv = i === 0 ? 100 : funnelSteps[i - 1].value > 0
              ? Math.round((step.value / funnelSteps[i - 1].value) * 100) : 0;
            const barColors: Record<string, string> = {
              blue: "bg-blue-500", purple: "bg-purple-500", green: "bg-green-500",
              orange: "bg-orange-500", red: "bg-red-500",
            };
            return (
              <div key={step.label} className="flex items-center gap-4">
                <div className="w-28 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{step.icon}</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      {step.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{step.sub}</div>
                </div>
                <div className="flex-1">
                  <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg transition-all ${barColors[step.color] ?? "bg-blue-500"} opacity-80`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-xs font-bold text-slate-800 dark:text-white drop-shadow">
                        {step.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-20 shrink-0 text-right">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{pct}%</div>
                  {i > 0 && (
                    <div className={`text-xs ${stepConv >= 50 ? "text-green-600 dark:text-green-400" : stepConv >= 25 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                      ↓ {stepConv}% шаг
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Key Metrics Grid ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Ключевые метрики
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon="👥" label="Всего пользователей" value={d.totalWebUsers}
            sub={`+${d.newUsersLast7} за 7 дней`}
            trend={{ value: d.growthRate, label: "vs пред. 30д" }}
            color="blue"
          />
          <MetricCard
            icon="⚡" label="Активация" value={`${d.activationRate}%`}
            sub={`${d.usersWithFirstUpload} из ${d.totalTelegramUsers} сделали загрузку`}
            color="purple"
          />
          <MetricCard
            icon="🔄" label="Retention 30д" value={`${d.retentionRate30}%`}
            sub={`${d.activeUsersLast30} активных пользователей`}
            trend={{ value: -d.churnRate, label: "churn" }}
            color="green"
          />
          <MetricCard
            icon="📦" label="Загрузок сегодня" value={d.uploadsToday}
            sub={`${d.uploadsLast7} за 7 дней · ${d.uploadsLast30} за 30 дней`}
            color="orange"
          />
        </div>
      </div>

      {/* ── Acquisition + Activation ──────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Acquisition */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Acquisition" subtitle="Привлечение новых пользователей" badge="A" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{d.totalWebUsers}</div>
                <div className="text-sm text-slate-500">Всего зарегистрировано</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">+{d.newUsersLast30}</div>
                <div className="text-xs text-slate-400">за 30 дней</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Telegram-пользователи</span>
                <span className="font-medium text-slate-900 dark:text-white">{d.totalTelegramUsers}</span>
              </div>
              <ProgressBar value={d.totalTelegramUsers} max={d.totalWebUsers} color="purple" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Новые за 7 дней</span>
                <span className="font-medium text-slate-900 dark:text-white">{d.newUsersLast7}</span>
              </div>
              <ProgressBar value={d.newUsersLast7} max={d.newUsersLast30} color="blue" />
            </div>
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              d.growthRate > 0 ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : d.growthRate < 0 ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              : "bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
            }`}>
              <span className="text-lg">{d.growthRate > 0 ? "📈" : d.growthRate < 0 ? "📉" : "➡️"}</span>
              <span>Рост {d.growthRate > 0 ? "+" : ""}{d.growthRate}% по сравнению с предыдущим месяцем</span>
            </div>
          </div>
        </div>

        {/* Activation */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Activation" subtitle="Первое целевое действие" badge="A" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{d.telegramLinkRate}%</div>
                <div className="text-xs text-purple-600 dark:text-purple-500 mt-1">Привязали Telegram</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{d.activationRate}%</div>
                <div className="text-xs text-green-600 dark:text-green-500 mt-1">Первая загрузка</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Привязали Telegram</span>
                  <span className="font-medium">{d.activatedUsers} / {d.totalWebUsers}</span>
                </div>
                <ProgressBar value={d.activatedUsers} max={d.totalWebUsers} color="purple" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Сделали загрузку</span>
                  <span className="font-medium">{d.usersWithFirstUpload} / {d.totalTelegramUsers}</span>
                </div>
                <ProgressBar value={d.usersWithFirstUpload} max={d.totalTelegramUsers} color="green" />
              </div>
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
              💡 Целевое действие: отправить файл, фото или голосовое сообщение через Telegram-бота
            </div>
          </div>
        </div>
      </div>

      {/* ── Retention + Revenue ───────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Retention & Churn */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Retention & Churn" subtitle="Регулярность использования" badge="R" />
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className="text-xl font-bold text-slate-900 dark:text-white">{d.retentionRate7}%</div>
                <div className="text-xs text-slate-500 mt-1">7-дневный</div>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className="text-xl font-bold text-slate-900 dark:text-white">{d.retentionRate30}%</div>
                <div className="text-xs text-slate-500 mt-1">30-дневный</div>
              </div>
              <div className={`text-center p-3 rounded-lg ${d.churnRate > 20 ? "bg-red-50 dark:bg-red-900/20" : "bg-slate-50 dark:bg-slate-700/50"}`}>
                <div className={`text-xl font-bold ${d.churnRate > 20 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                  {d.churnRate}%
                </div>
                <div className="text-xs text-slate-500 mt-1">Churn</div>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Активны за 7 дней</span>
                  <span className="font-medium">{d.activeUsersLast7}</span>
                </div>
                <ProgressBar value={d.activeUsersLast7} max={d.totalTelegramUsers} color="green" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400">Power users (20+ загрузок)</span>
                  <span className="font-medium">{d.powerUsers}</span>
                </div>
                <ProgressBar value={d.powerUsers} max={d.totalTelegramUsers} color="orange" />
              </div>
            </div>
            <div className={`text-sm p-3 rounded-lg ${
              d.churnRate > 30 ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              : d.churnRate > 15 ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
              : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
            }`}>
              {d.churnRate > 30 ? "⚠️ Высокий churn — нужно улучшить онбординг"
               : d.churnRate > 15 ? "⚡ Умеренный churn — есть точки роста"
               : "✅ Низкий churn — продукт удерживает пользователей"}
            </div>
          </div>
        </div>

        {/* Revenue proxy (engagement) */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Revenue / Engagement" subtitle="Интенсивность использования" badge="R" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{d.totalUploads}</div>
                <div className="text-xs text-blue-600 dark:text-blue-500 mt-1">Всего загрузок</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{d.avgUploadsPerUser}</div>
                <div className="text-xs text-slate-500 mt-1">Загрузок / пользователь</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Успешных загрузок</span>
                <span className="font-medium text-green-600 dark:text-green-400">{d.successRate}%</span>
              </div>
              <ProgressBar value={d.successRate} max={100} color="green" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Голосовые сообщения</span>
                <span className="font-medium">{d.voiceUploads}</span>
              </div>
              <ProgressBar value={d.voiceUploads} max={d.totalUploads} color="purple" />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                По типам контента
              </div>
              <div className="flex flex-wrap gap-2">
                {d.contentTypes.map(ct => (
                  <div key={ct.content_type} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-1.5">
                    <span>{contentTypeIcons[ct.content_type] ?? "📎"}</span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{ct.content_type}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{ct.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Activity Chart ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <SectionHeader title="Активность за 30 дней" subtitle="Количество загрузок по дням" />
        <div className="flex items-end gap-1 h-24">
          {d.dailyChart.map(({ date, count }) => {
            const maxCount = Math.max(...d.dailyChart.map(r => r.count), 1);
            const height   = Math.max(Math.round((count / maxCount) * 100), count > 0 ? 8 : 2);
            const isToday  = date === new Date().toISOString().slice(0, 10);
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className={`w-full rounded-sm transition-all ${isToday ? "bg-blue-500" : "bg-blue-300 dark:bg-blue-700 group-hover:bg-blue-400 dark:group-hover:bg-blue-600"}`}
                  style={{ height: `${height}%` }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                  {date.slice(5)}: {count}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>{d.dailyChart[0]?.date.slice(5)}</span>
          <span>Сегодня</span>
        </div>
      </div>

      {/* ── Top Users + Product Health ────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top users */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Топ пользователей" subtitle="По количеству загрузок" badge="TOP" />
          {d.topUsers.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-8">Нет данных</div>
          ) : (
            <div className="space-y-3">
              {d.topUsers.map((u, i) => {
                const maxUploads = d.topUsers[0]?.uploads_count ?? 1;
                const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span>{medals[i] ?? "•"}</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {u.first_name ?? u.username ?? "Аноним"}
                        </span>
                        {u.username && (
                          <span className="text-xs text-slate-400">@{u.username}</span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {u.uploads_count}
                      </span>
                    </div>
                    <ProgressBar value={u.uploads_count} max={maxUploads} color={i === 0 ? "orange" : "blue"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Health */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <SectionHeader title="Product Health" subtitle="Сводка ключевых сигналов" badge="HEALTH" />
          <div className="space-y-3">
            {[
              { label: "Активация (Telegram link)",  value: d.telegramLinkRate, threshold: 50, icon: "🔗" },
              { label: "Активация (первая загрузка)", value: d.activationRate,  threshold: 40, icon: "📤" },
              { label: "Retention 7д",               value: d.retentionRate7,   threshold: 30, icon: "📅" },
              { label: "Retention 30д",              value: d.retentionRate30,  threshold: 20, icon: "📆" },
              { label: "Успешность загрузок",        value: d.successRate,      threshold: 90, icon: "✅" },
            ].map(({ label, value, threshold, icon }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-base w-6">{icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">{label}</span>
                    <span className={`font-bold ${value >= threshold ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {value}%
                    </span>
                  </div>
                  <ProgressBar value={value} max={100} color={value >= threshold ? "green" : "red"} />
                </div>
                <span className="text-base w-6">{value >= threshold ? "✅" : "⚠️"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary Insights ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
          🔍 Аналитические инсайты
        </h2>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-3">
            <div className="font-medium text-slate-900 dark:text-white mb-1">Acquisition</div>
            <div className="text-slate-600 dark:text-slate-400">
              {d.growthRate > 10
                ? `Быстрый рост +${d.growthRate}% — масштабируйте каналы привлечения`
                : d.growthRate > 0
                ? `Умеренный рост +${d.growthRate}% — тестируйте новые каналы`
                : `Рост замедлился (${d.growthRate}%) — нужна новая стратегия привлечения`}
            </div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-3">
            <div className="font-medium text-slate-900 dark:text-white mb-1">Activation</div>
            <div className="text-slate-600 dark:text-slate-400">
              {d.activationRate > 60
                ? "Отличная активация — большинство пользователей доходят до первого действия"
                : d.activationRate > 30
                ? "Средняя активация — упростите онбординг и добавьте подсказки"
                : "Низкая активация — критически нужно улучшить первый опыт"}
            </div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-3">
            <div className="font-medium text-slate-900 dark:text-white mb-1">Retention</div>
            <div className="text-slate-600 dark:text-slate-400">
              {d.retentionRate30 > 40
                ? "Высокий retention — продукт создаёт привычку"
                : d.retentionRate30 > 20
                ? "Средний retention — добавьте напоминания и новые функции"
                : "Низкий retention — нужно найти и устранить причины оттока"}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
