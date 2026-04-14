import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collector Bot",
  description: "Telegram-бот для сбора материалов в Google Drive",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
