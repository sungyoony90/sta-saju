import type { SajuChart } from "./chart";
import type { CareerContext } from "./sample-reading";
import type { DailyFortuneContext } from "./daily-fortune";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export type GeminiReading = {
  version: 1;
  cards: Array<{
    id: "career" | "core" | "timing";
    title: string;
    summary: string;
    evidence: string;
    action: string;
  }>;
  conclusion: string;
  realityChecks: string[];
  disclaimer: string;
};

export type GeminiFollowUp = {
  answer: string;
  realityChecks: string[];
  disclaimer: string;
};

export type GeminiDailyFortune = {
  version: 1;
  headline: string;
  cards: Array<{
    id: "overall" | "workMoney" | "relationship";
    title: string;
    summary: string;
    evidence: string;
    action: string;
  }>;
  caution: string;
  disclaimer: string;
};

export type ConversationItem = { question: string; answer: string };

export class GeminiContractError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  value: unknown,
  name: string,
  maxLength = 1200,
): string {
  if (typeof value !== "string" || !value.trim())
    throw new GeminiContractError(`${name} 값이 필요합니다.`);
  const clean = value.trim();
  if (clean.length > maxLength)
    throw new GeminiContractError(`${name} 값이 너무 깁니다.`);
  return clean;
}

export function sanitizeChart(value: unknown): SajuChart {
  if (!isRecord(value))
    throw new GeminiContractError("사주 계산 결과를 확인해주세요.");
  if (!Array.isArray(value.pillars) || value.pillars.length !== 4)
    throw new GeminiContractError("사주 네 기둥을 확인해주세요.");

  const pillars = value.pillars.map((raw) => {
    if (!isRecord(raw))
      throw new GeminiContractError("사주 기둥 형식이 올바르지 않습니다.");
    return {
      label: stringField(raw.label, "기둥 이름", 10),
      text: stringField(raw.text, "간지", 10),
      korean: stringField(raw.korean, "한글 간지", 20),
      stem: stringField(raw.stem, "천간", 5),
      branch: stringField(raw.branch, "지지", 5),
      stemElement: stringField(raw.stemElement, "천간 오행", 5),
      branchElement: stringField(raw.branchElement, "지지 오행", 5),
    };
  });

  if (!isRecord(value.elements) || !isRecord(value.dayMaster))
    throw new GeminiContractError("오행 계산 결과를 확인해주세요.");
  const rawElements = value.elements;
  const rawDayMaster = value.dayMaster;
  const elements = Object.fromEntries(
    ["목", "화", "토", "금", "수"].map((key) => {
      const count = rawElements[key];
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
        throw new GeminiContractError("오행 개수 형식이 올바르지 않습니다.");
      return [key, count];
    }),
  ) as SajuChart["elements"];

  return {
    pillars,
    elements,
    dayMaster: {
      character: stringField(rawDayMaster.character, "일간", 5),
      korean: stringField(rawDayMaster.korean, "한글 일간", 10),
      element: stringField(rawDayMaster.element, "일간 오행", 5),
    },
    method: stringField(value.method, "계산 방식", 300),
    engine: stringField(value.engine, "계산 엔진", 100),
    elementMethod: stringField(value.elementMethod, "오행 집계 방식", 500),
  };
}

export function sanitizeContext(value: unknown): CareerContext {
  if (!isRecord(value))
    throw new GeminiContractError("현재 상황 입력을 확인해주세요.");
  return {
    employment: stringField(value.employment, "현재 상태", 50),
    concern: stringField(value.concern, "가장 큰 고민", 80),
    timing: stringField(value.timing, "변화 시점", 50),
    situation: stringField(value.situation, "현재 상황", 500),
    question: stringField(value.question, "질문", 200),
  };
}

export function sanitizeConversation(value: unknown): ConversationItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3)
    throw new GeminiContractError("이전 대화는 최대 3회까지 전달할 수 있습니다.");
  return value.map((item) => {
    if (!isRecord(item))
      throw new GeminiContractError("이전 대화 형식이 올바르지 않습니다.");
    return {
      question: stringField(item.question, "이전 질문", 200),
      answer: stringField(item.answer, "이전 답변", 1800),
    };
  });
}

function responseString(value: unknown, name: string, maxLength = 2000) {
  return stringField(value, name, maxLength);
}

export function parseGeminiReading(value: unknown): GeminiReading {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.cards))
    throw new GeminiContractError("Gemini 해석 결과의 형식이 올바르지 않습니다.");
  if (value.cards.length !== 3)
    throw new GeminiContractError("Gemini 해석 카드가 세 개가 아닙니다.");

  const allowed = new Set(["career", "core", "timing"]);
  const seen = new Set<string>();
  const cards = value.cards.map((card) => {
    if (!isRecord(card) || typeof card.id !== "string" || !allowed.has(card.id))
      throw new GeminiContractError("Gemini 카드 종류가 올바르지 않습니다.");
    if (seen.has(card.id))
      throw new GeminiContractError("Gemini 카드 종류가 중복되었습니다.");
    seen.add(card.id);
    return {
      id: card.id as "career" | "core" | "timing",
      title: responseString(card.title, "카드 제목", 80),
      summary: responseString(card.summary, "카드 요약"),
      evidence: responseString(card.evidence, "카드 근거"),
      action: responseString(card.action, "다음 행동"),
    };
  });

  if (!Array.isArray(value.realityChecks) || value.realityChecks.length < 1)
    throw new GeminiContractError("현실 확인 조건이 필요합니다.");

  return {
    version: 1,
    cards,
    conclusion: responseString(value.conclusion, "한 줄 결론", 500),
    realityChecks: value.realityChecks.map((item) =>
      responseString(item, "현실 확인 조건", 300),
    ),
    disclaimer: responseString(value.disclaimer, "참고 안내", 500),
  };
}

export function parseGeminiFollowUp(value: unknown): GeminiFollowUp {
  if (!isRecord(value) || !Array.isArray(value.realityChecks))
    throw new GeminiContractError("Gemini 추가 답변의 형식이 올바르지 않습니다.");
  return {
    answer: responseString(value.answer, "추가 답변"),
    realityChecks: value.realityChecks.map((item) =>
      responseString(item, "현실 확인 조건", 300),
    ),
    disclaimer: responseString(value.disclaimer, "참고 안내", 500),
  };
}

export function parseGeminiDailyFortune(value: unknown): GeminiDailyFortune {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.cards))
    throw new GeminiContractError("오늘의 운세 결과 형식이 올바르지 않습니다.");
  if (value.cards.length !== 3)
    throw new GeminiContractError("오늘의 운세 카드가 세 개가 아닙니다.");

  const allowed = new Set(["overall", "workMoney", "relationship"]);
  const seen = new Set<string>();
  const cards = value.cards.map((card) => {
    if (!isRecord(card) || typeof card.id !== "string" || !allowed.has(card.id))
      throw new GeminiContractError("오늘의 운세 카드 종류가 올바르지 않습니다.");
    if (seen.has(card.id))
      throw new GeminiContractError("오늘의 운세 카드 종류가 중복되었습니다.");
    seen.add(card.id);
    return {
      id: card.id as "overall" | "workMoney" | "relationship",
      title: responseString(card.title, "오늘의 운세 카드 제목", 80),
      summary: responseString(card.summary, "오늘의 운세 카드 요약", 1000),
      evidence: responseString(card.evidence, "오늘의 운세 계산 근거", 1000),
      action: responseString(card.action, "오늘의 행동", 500),
    };
  });

  return {
    version: 1,
    headline: responseString(value.headline, "오늘의 한 줄 운세", 300),
    cards,
    caution: responseString(value.caution, "오늘의 주의점", 500),
    disclaimer: responseString(value.disclaimer, "참고 안내", 500),
  };
}

function chartPrompt(chart: SajuChart) {
  return JSON.stringify({
    pillars: chart.pillars.map((item) => ({
      label: item.label,
      text: item.text,
      korean: item.korean,
      stemElement: item.stemElement,
      branchElement: item.branchElement,
    })),
    elements: chart.elements,
    dayMaster: chart.dayMaster,
    calculationNotice: chart.method,
    elementNotice: chart.elementMethod,
  });
}

export function buildReadingPrompt(chart: SajuChart, context: CareerContext) {
  return `당신은 사주 계산기가 아니라, 이미 계산된 결과를 쉬운 한국어로 설명하는 커리어 상담 도우미입니다.

[반드시 지킬 규칙]
- 입력에 있는 사주 계산값만 사용하고 사주 원국을 다시 계산하거나 바꾸지 마세요.
- 사용자의 현재 상황을 구체적으로 반영하세요.
- 결론은 분명하게 제안하되 취업, 미래, 수익을 보장하지 마세요.
- 직업·이직·진로와 돈·재물 범위에서만 답하세요.
- 전문 용어에는 쉬운 뜻을 붙이세요.
- 각 카드에는 사주 근거와 현실적인 다음 행동을 포함하세요.
- 오행 집계는 강약 확정이 아니라 대표 오행 8자를 센 참고값임을 지키세요.
- 입력에 없는 실제 경험이나 사건을 지어내지 마세요.
- 출력은 지정된 JSON 구조만 사용하세요.

[사주 계산 결과]
${chartPrompt(chart)}

[현재 상황]
${JSON.stringify(context)}

career, core, timing 카드 세 개로 맞춤 해석을 작성하세요.`;
}

export function buildDailyFortunePrompt(
  chart: SajuChart,
  daily: DailyFortuneContext,
) {
  return `당신은 사주 계산기가 아니라, 서버에서 계산한 출생 원국과 오늘 일진을 쉬운 한국어로 설명하는 오늘의 운세 도우미입니다.

[반드시 지킬 규칙]
- 입력에 있는 출생 원국과 오늘 일진만 사용하고 날짜나 사주를 다시 계산하거나 바꾸지 마세요.
- 오늘 하루의 경향을 제안하되 사건, 행운, 수익, 관계 결과를 사실처럼 보장하지 마세요.
- 사용자가 오늘 현실에서 확인하거나 실행할 수 있는 구체적인 행동을 제시하세요.
- 각 카드의 evidence에는 어떤 원국 요소와 오늘 일진을 연결했는지 쉬운 말로 밝히세요.
- 오행 개수만으로 강약이나 길흉을 확정하지 마세요.
- 입력에 없는 실제 경험이나 사건을 지어내지 마세요.
- 출력은 지정된 JSON 구조만 사용하세요.

[출생 원국 계산 결과]
${chartPrompt(chart)}

[오늘 계산 결과]
${JSON.stringify({
  date: daily.date,
  timezone: daily.timezone,
  dayPillar: {
    text: daily.dayPillar.text,
    korean: daily.dayPillar.korean,
    stemElement: daily.dayPillar.stemElement,
    branchElement: daily.dayPillar.branchElement,
  },
})}

overall, workMoney, relationship 카드 세 개로 오늘의 운세를 작성하세요.`;
}

export function buildFollowUpPrompt(
  chart: SajuChart,
  context: CareerContext,
  conversation: ConversationItem[],
  question: string,
) {
  return `당신은 이미 계산된 사주 결과와 현재 상황을 바탕으로 후속 질문에 답하는 한국어 커리어 상담 도우미입니다.

[반드시 지킬 규칙]
- 사주를 다시 계산하거나 입력값을 바꾸지 마세요.
- 이전 상담과 모순되지 않게 답하세요.
- 결론은 분명하게 제안하되 미래, 취업, 수익을 보장하지 마세요.
- 재정 질문에는 손실 가능성과 현실에서 확인할 조건을 포함하세요.
- 전문 용어에는 쉬운 설명을 붙이세요.
- 출력은 지정된 JSON 구조만 사용하세요.

[사주 계산 결과]
${chartPrompt(chart)}

[현재 상황]
${JSON.stringify(context)}

[이전 대화]
${JSON.stringify(conversation)}

[새 질문]
${question}`;
}

export const readingResponseSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["career", "core", "timing"] },
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
  required: ["version", "cards", "conclusion", "realityChecks", "disclaimer"],
};

export const followUpResponseSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    realityChecks: { type: "array", minItems: 1, items: { type: "string" } },
    disclaimer: { type: "string" },
  },
  required: ["answer", "realityChecks", "disclaimer"],
};

export const dailyFortuneResponseSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    headline: { type: "string" },
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            enum: ["overall", "workMoney", "relationship"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          evidence: { type: "string" },
          action: { type: "string" },
        },
        required: ["id", "title", "summary", "evidence", "action"],
      },
    },
    caution: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: ["version", "headline", "cards", "caution", "disclaimer"],
};
