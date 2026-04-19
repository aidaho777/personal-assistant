"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Point { date: string; count: number }

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export default function UploadsChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#94a3b8" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#60a5fa" }}
          labelFormatter={(label: unknown) => fmtDate(label as string)}
          formatter={(v: unknown) => [`${v}`, "файлов"]}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
