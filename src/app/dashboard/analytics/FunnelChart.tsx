"use client";

interface Step {
  step: number;
  label: string;
  value: number;
  conversion: number;
  stepConversion: number;
}

export default function FunnelChart({ data }: { data: Step[] }) {
  const max = data[0]?.value || 1;

  return (
    <div className="space-y-3">
      {data.map((row, i) => {
        const pct = Math.round((row.value / max) * 100);
        return (
          <div key={row.step}>
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                  {row.step}
                </span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">{row.label}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                <span className="font-mono font-semibold text-slate-900 dark:text-white">{row.value}</span>
                {i > 0 && (
                  <span className={`text-xs ${row.stepConversion > 50 ? "text-green-500" : "text-red-400"}`}>
                    ↓{row.stepConversion}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-lg flex items-center pl-3 text-white text-xs font-medium transition-all"
                style={{ width: `${Math.max(pct, 2)}%` }}
              >
                {pct > 15 ? `${pct}%` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
