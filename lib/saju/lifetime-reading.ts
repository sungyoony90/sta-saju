import type { SajuChart } from "./chart";
import { GeminiContractError, sanitizeChart } from "./gemini-contract";

export const LIFETIME_CARD_IDS = [
  "temperament",
  "strengths",
  "relationships",
  "work",
  "money",
] as const;

export type LifetimeCardId = (typeof LIFETIME_CARD_IDS)[number];

export type LifetimeReading = {
  version: 1;
  kind: "lifetime";
  summary: string;
  cards: Array<{
    id: LifetimeCardId;
    title: string;
    interpretation: string;
    evidence: string[];
    reflectionQuestion: string;
  }>;
  disclaimer: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim())
    throw new GeminiContractError(`${name} 값이 필요합니다.`);
  const clean = value.trim();
  if (clean.length > maxLength)
    throw new GeminiContractError(`${name} 값이 너무 깁니다.`);
  return clean;
}

function validateEvidence(value: string, chart: SajuChart) {
  const validPillars = new Set(chart.pillars.map((pillar) => pillar.text));
  const mentionedPillars = value.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g) ?? [];
  if (mentionedPillars.some((pillar) => !validPillars.has(pillar)))
    throw new GeminiContractError("계산값에 없는 간지를 근거로 사용할 수 없습니다.");

  let hasChartReference = chart.pillars.some(
    (pillar) => value.includes(pillar.text) || value.includes(pillar.korean),
  );
  if (
    value.includes(chart.dayMaster.character) ||
    value.includes(`${chart.dayMaster.korean}일간`) ||
    value.includes(`일간 ${chart.dayMaster.korean}`)
  ) {
    hasChartReference = true;
  }

  const elementPattern = /([목화토금수])(?:\s*오행)?(?:이|가|은|는)?\s*(\d+)\s*개/g;
  for (const match of value.matchAll(elementPattern)) {
    const element = match[1] as keyof SajuChart["elements"];
    if (Number(match[2]) !== chart.elements[element])
      throw new GeminiContractError("계산값과 다른 오행 개수를 근거로 사용할 수 없습니다.");
    hasChartReference = true;
  }

  if (!hasChartReference)
    throw new GeminiContractError("카드 근거가 계산된 사주 값과 연결되지 않았습니다.");
}

export function parseLifetimeReading(
  value: unknown,
  rawChart: unknown,
): LifetimeReading {
  const chart = sanitizeChart(rawChart);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["version", "kind", "summary", "cards", "disclaimer"]) ||
    value.version !== 1 ||
    value.kind !== "lifetime" ||
    !Array.isArray(value.cards)
  ) {
    throw new GeminiContractError("전체 풀이 결과의 형식이 올바르지 않습니다.");
  }
  if (value.cards.length !== LIFETIME_CARD_IDS.length)
    throw new GeminiContractError("전체 풀이 카드가 다섯 개가 아닙니다.");

  const cards = value.cards.map((card, index) => {
    if (
      !isRecord(card) ||
      !hasOnlyKeys(card, [
        "id",
        "title",
        "interpretation",
        "evidence",
        "reflectionQuestion",
      ]) ||
      card.id !== LIFETIME_CARD_IDS[index] ||
      !Array.isArray(card.evidence) ||
      card.evidence.length < 1 ||
      card.evidence.length > 4
    ) {
      throw new GeminiContractError("전체 풀이 카드의 종류 또는 순서가 올바르지 않습니다.");
    }

    const evidence = card.evidence.map((item) => {
      const clean = text(item, "카드 근거", 300);
      validateEvidence(clean, chart);
      return clean;
    });
    return {
      id: LIFETIME_CARD_IDS[index],
      title: text(card.title, "카드 제목", 80),
      interpretation: text(card.interpretation, "카드 해석", 1600),
      evidence,
      reflectionQuestion: text(card.reflectionQuestion, "현실 점검 질문", 300),
    };
  });

  return {
    version: 1,
    kind: "lifetime",
    summary: text(value.summary, "한 줄 요약", 500),
    cards,
    disclaimer: text(value.disclaimer, "참고 안내", 500),
  };
}

function chartPrompt(chart: SajuChart) {
  return JSON.stringify({
    pillars: chart.pillars.map((pillar) => ({
      label: pillar.label,
      text: pillar.text,
      korean: pillar.korean,
      stemElement: pillar.stemElement,
      branchElement: pillar.branchElement,
    })),
    elements: chart.elements,
    dayMaster: chart.dayMaster,
    calculationNotice: chart.method,
    elementNotice: chart.elementMethod,
  });
}

export function buildLifetimePrompt(rawChart: unknown) {
  const chart = sanitizeChart(rawChart);
  return `당신은 사주 계산기가 아니라, 이미 계산된 출생 원국을 쉬운 한국어로 설명하는 도우미입니다.

[반드시 지킬 규칙]
- 입력에 있는 계산값만 사용하고 원국을 다시 계산하거나 바꾸지 마세요.
- 취업 고민이나 현재 상황을 추측하지 말고 삶 전반의 반복 경향만 설명하세요.
- 특정 과거 사건, 미래 사건, 수명, 질병, 합격, 취업, 관계 결과, 수익을 단정하지 마세요.
- 오행 개수만으로 강약, 길흉 또는 사람의 가치를 단정하지 마세요.
- 전문 용어에는 쉬운 뜻을 함께 쓰세요.
- 각 evidence 항목에는 반드시 입력에 있는 간지·일간 또는 정확한 "오행 N개" 값을 그대로 포함하세요.
- 각 카드에는 사용자가 현실 경험과 비교할 수 있는 질문 하나를 넣으세요.
- 출력은 지정된 JSON 구조만 사용하세요.

[사주 계산 결과]
${chartPrompt(chart)}

temperament, strengths, relationships, work, money 순서로 카드 다섯 개를 작성하세요.`;
}

const cardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", enum: [...LIFETIME_CARD_IDS] },
    title: { type: "string" },
    interpretation: { type: "string" },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
    },
    reflectionQuestion: { type: "string" },
  },
  required: ["id", "title", "interpretation", "evidence", "reflectionQuestion"],
};

export const lifetimeResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] },
    kind: { type: "string", enum: ["lifetime"] },
    summary: { type: "string" },
    cards: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: cardSchema,
    },
    disclaimer: { type: "string" },
  },
  required: ["version", "kind", "summary", "cards", "disclaimer"],
};

export function isLifetimeReading(value: unknown): value is LifetimeReading {
  return isRecord(value) && value.kind === "lifetime";
}
