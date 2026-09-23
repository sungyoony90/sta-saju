import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "맞춤 사주 커리어 상담",
  description: "사주와 현재 상황을 함께 반영하는 커리어 상담 프로토타입",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
