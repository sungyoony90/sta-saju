import { calculateDayPillar, type Pillar } from "./chart";

export type DailyFortuneContext = {
  date: string;
  dateLabel: string;
  dayPillar: Pillar;
  timezone: "Asia/Seoul";
};

export function getKoreanDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day)
    throw new Error("한국 시간의 오늘 날짜를 확인하지 못했습니다.");
  return `${year}-${month}-${day}`;
}

export function buildDailyFortuneContext(date: string): DailyFortuneContext {
  const [year, month, day] = date.split("-").map(Number);
  const dayPillar = calculateDayPillar(date);
  return {
    date,
    dateLabel: `${year}년 ${month}월 ${day}일`,
    dayPillar,
    timezone: "Asia/Seoul",
  };
}

export function getTodayFortuneContext(now = new Date()) {
  return buildDailyFortuneContext(getKoreanDate(now));
}
