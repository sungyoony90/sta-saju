import type { SajuChart } from "./chart";
import { GeminiContractError } from "./gemini-contract";
import type { YearFlow } from "./year-flow";

export type YearlyReading = {
  kind: "yearly";
  version: 1;
  targetYear: number;
  yearPillar: string;
  cards: Array<{
    id: "overall" | "relationship" | "work" | "money";
    title: string;
    summary: string;
    evidence: string;
    action: string;
  }>;
  conclusion: string;
  realityChecks: string[];
  disclaimer: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, maxLength = 2000) {
  if (typeof value !== "string" || !value.trim())
    throw new GeminiContractError(`${name} 값이 필요합니다.`);
  const clean = value.trim();
  if (clean.length > maxLength)
    throw new GeminiContractError(`${name} 값이 너무 깁니다.`);
  return clean;
}

function chartPrompt(chart: SajuChart) {
  return {
    pillars: chart.pillars.map(({ label, text, korean, stemElement, branchElement }) => ({
      label,
      text,
      korean,
      stemElement,
      branchElement,
    })),
    elements: chart.elements,
    dayMaster: chart.dayMaster,
    calculationNotice: chart.method,
    elementNotice: chart.elementMethod,
  };
}

export function buildYearlyReadingPrompt(
  chart: SajuChart,
  yearFlow: YearFlow,
  currentYear: number,
  today: string,
) {
  return `당신은 사주 계산기가 아니라, 제공된 출생 원국과 선택 연도의 연주를 쉬운 한국어로 설명하는 도우미입니다.

[반드시 지킬 규칙]
- 제공된 계산값만 사용하고 원국이나 연주를 다시 계산하거나 바꾸지 마세요.
- targetYear는 반드시 ${yearFlow.targetYear}, yearPillar는 반드시 ${yearFlow.pillar}로 출력하세요.
- 전체 방향, 관계, 일, 돈의 네 카드로 답하세요.
- 각 카드에는 계산 근거와 현실에서 확인할 행동을 포함하세요.
- ${yearFlow.targetYear === currentYear ? `올해는 한국 시각 ${today} 이후의 흐름만 설명하고 이미 지난 일을 예언하지 마세요.` : `${yearFlow.targetYear}년 한 해의 가능성을 설명하세요.`}
- 월별·날짜별 사건, 관계 성패, 취업, 수익을 확정하거나 보장하지 마세요.
- 오행 개수만으로 강약이나 길흉을 단정하지 마세요.
- 입력에 없는 경험이나 사건을 지어내지 마세요.
- 출력은 지정된 JSON 구조만 사용하세요.

[출생 원국 계산 결과]
${JSON.stringify(chartPrompt(chart))}

[대상 연도 계산 결과]
${JSON.stringify({
    targetYear: yearFlow.targetYear,
    yearPillar: yearFlow.pillar,
    korean: yearFlow.korean,
    boundary: "연주의 경계는 음력 설이 아닌 입춘입니다.",
  })}

overall, relationship, work, money 카드 네 개로 해석을 작성하세요.`;
}

export function parseYearlyReading(value: unknown, expected?: YearFlow): YearlyReading {
  if (
    !isRecord(value) ||
    value.kind !== "yearly" ||
    value.version !== 1 ||
    !Array.isArray(value.cards)
  )
    throw new GeminiContractError("연도 풀이 결과의 형식이 올바르지 않습니다.");
  if (!Number.isInteger(value.targetYear))
    throw new GeminiContractError("연도 풀이의 대상 연도가 올바르지 않습니다.");
  const yearPillar = requiredString(value.yearPillar, "대상 연주", 10);
  if (
    expected &&
    (value.targetYear !== expected.targetYear || yearPillar !== expected.pillar)
  )
    throw new GeminiContractError("연도 풀이의 계산 기준이 요청과 일치하지 않습니다.");
  if (value.cards.length !== 4)
    throw new GeminiContractError("연도 풀이 카드가 네 개가 아닙니다.");

  const allowed = new Set(["overall", "relationship", "work", "money"]);
  const seen = new Set<string>();
  const cards = value.cards.map((card) => {
    if (!isRecord(card) || typeof card.id !== "string" || !allowed.has(card.id))
      throw new GeminiContractError("연도 풀이 카드 종류가 올바르지 않습니다.");
    if (seen.has(card.id))
      throw new GeminiContractError("연도 풀이 카드 종류가 중복되었습니다.");
    seen.add(card.id);
    return {
      id: card.id as "overall" | "relationship" | "work" | "money",
      title: requiredString(card.title, "카드 제목", 80),
      summary: requiredString(card.summary, "카드 요약"),
      evidence: requiredString(card.evidence, "카드 근거"),
      action: requiredString(card.action, "현실 점검 항목"),
    };
  });

  if (!Array.isArray(value.realityChecks) || value.realityChecks.length < 1)
    throw new GeminiContractError("현실 확인 조건이 필요합니다.");
  return {
    kind: "yearly",
    version: 1,
    targetYear: value.targetYear as number,
    yearPillar,
    cards,
    conclusion: requiredString(value.conclusion, "한 줄 결론", 500),
    realityChecks: value.realityChecks.map((item) =>
      requiredString(item, "현실 확인 조건", 300),
    ),
    disclaimer: requiredString(value.disclaimer, "참고 안내", 500),
  };
}

export const yearlyReadingResponseSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["yearly"] },
    version: { type: "integer", enum: [1] },
    targetYear: { type: "integer" },
    yearPillar: { type: "string" },
    cards: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["overall", "relationship", "work", "money"] },
          title: { type: "string" },
          summary: { type: "string" },
          evidence: { type: "string" },
          action: { type: "string" },
        },
        required: ["id", "title", "summary", "evidence", "action"],
      },
    },
    conclusion: { type: "string" },
    realityChecks: { type: "array", minItems: 1, items: { type: "string" } },
    disclaimer: { type: "string" },
  },
  required: [
    "kind",
    "version",
    "targetYear",
    "yearPillar",
    "cards",
    "conclusion",
    "realityChecks",
    "disclaimer",
  ],
};
