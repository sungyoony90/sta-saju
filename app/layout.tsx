import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 사주와 앞으로의 흐름",
  description: "계산된 사주와 선택한 연도의 관계·일·돈 흐름을 살펴보는 서비스",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
