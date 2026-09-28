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

export function getKoreanCurrentYear(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(now),
  );
}

export function validateTargetYear(targetYear: unknown, currentYear: number): number {
  if (!Number.isInteger(targetYear))
    throw new YearFlowError("살펴볼 연도를 선택해주세요.");
  const year = targetYear as number;
  if (year < currentYear || year > currentYear + 5)
    throw new YearFlowError(`연도는 ${currentYear}년부터 ${currentYear + 5}년까지 선택할 수 있습니다.`);
  return year;
}

export function calculateYearFlow(targetYear: unknown, currentYear: number): YearFlow {
  const year = validateTargetYear(targetYear, currentYear);
  // 한 해의 대표 간지는 입춘이 지난 7월 1일 정오를 기준점으로 얻습니다.
  const text = Solar.fromYmdHms(year, 7, 1, 12, 0, 0)
    .getLunar()
    .getEightChar()
    .getYear();
  const [stem, branch] = [...text];
  return {
    targetYear: year,
    pillar: text,
    korean: stemKo[stems.indexOf(stem)] + branchKo[branches.indexOf(branch)],
    boundary: "입춘",
  };
}
