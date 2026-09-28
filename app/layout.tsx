import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 사주 전체와 앞으로의 흐름",
  description: "출생 원국의 삶 전반 경향과 선택한 미래 연도의 흐름을 살펴보는 사주 프로토타입",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
