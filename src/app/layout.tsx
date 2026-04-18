import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collector Bot — AI Personal Assistant",
  description: "Telegram-бот для сбора материалов и структурированной загрузки в Google Drive",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          body { margin: 0; padding: 0; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
