import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘의 운세 · 맞춤 사주",
  description: "계산된 사주와 한국 시간의 오늘 일진을 함께 보는 맞춤 운세",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
