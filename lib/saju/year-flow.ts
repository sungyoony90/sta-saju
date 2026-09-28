import lunar from "lunar-javascript";

const { Solar } = lunar;

export type YearFlow = {
  targetYear: number;
  pillar: string;
  korean: string;
  boundary: "입춘";
};

export class YearFlowError extends Error {}

const stems = [..."甲乙丙丁戊己庚辛壬癸"];
const branches = [..."子丑寅卯辰巳午未申酉戌亥"];
const stemKo = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const branchKo = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

export function getKoreanDate(now = new Date()) {
  const korean = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: korean.getUTCFullYear(),
    month: korean.getUTCMonth() + 1,
    day: korean.getUTCDate(),
  };
}

export function getKoreanCurrentYear(now = new Date()): number {
  return getKoreanDate(now).year;
}

export function validateTargetYear(targetYear: unknown, currentYear: number): number {
  if (!Number.isInteger(targetYear))
    throw new YearFlowError("살펴볼 연도를 선택해주세요.");
  const year = targetYear as number;
  if (year < currentYear || year > currentYear + 5)
    throw new YearFlowError(
      `연도는 ${currentYear}년부터 ${currentYear + 5}년까지 선택할 수 있습니다.`,
    );
  return year;
}

export function calculateYearPillarAt(date: string, time = "12:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new YearFlowError("연주 계산 기준 시각을 확인해주세요.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // lunar-javascript의 절기 계산은 중국 표준시 기준이므로 한국 시각에서 1시간을 뺍니다.
  const chinaTime = new Date(Date.UTC(year, month - 1, day, hour - 1, minute));
  return Solar.fromYmdHms(
    chinaTime.getUTCFullYear(),
    chinaTime.getUTCMonth() + 1,
    chinaTime.getUTCDate(),
    chinaTime.getUTCHours(),
    minute,
    0,
  ).getLunar().getEightChar().getYear();
}

export function calculateYearFlow(targetYear: unknown, currentYear: number): YearFlow {
  const year = validateTargetYear(targetYear, currentYear);
  // 7월 1일은 항상 입춘 뒤이므로 선택 연도의 대표 연주를 안정적으로 구합니다.
  const text = calculateYearPillarAt(`${year}-07-01`);
  const [stem, branch] = [...text];
  return {
    targetYear: year,
    pillar: text,
    korean: stemKo[stems.indexOf(stem)] + branchKo[branches.indexOf(branch)],
    boundary: "입춘",
  };
}
