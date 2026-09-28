import type { SajuChart } from "./chart";
import type { YearFlow } from "./year-flow";
import { GeminiContractError } from "./gemini-contract";

export type ReadingKind = "lifetime" | "yearly";
export type WholeReadingSectionId =
  | "nature"
  | "strengths"
  | "relationships"
  | "work"
  | "money"
  | "overview";

export type WholeReading = {
  version: 2;
  kind: ReadingKind;
  targetYear?: number;
  headline: string;
  sections: Array<{
    id: WholeReadingSectionId;
    title: string;
    summary: string;
    evidence: string;
    evidenceRefs: string[];
    realityCheck: string;
    action: string;
  }>;
  disclaimer: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim())
    throw new GeminiContractError(`${name} 값이 필요합니다.`);
  const result = value.trim();
  if (result.length > max) throw new GeminiContractError(`${name} 값이 너무 깁니다.`);
  return result;
}

export function chartEvidenceRefs(chart: SajuChart, yearFlow?: YearFlow): string[] {
  const refs = [
    ...chart.pillars.map((pillar) => `${pillar.label}:${pillar.text}`),
    `일간:${chart.dayMaster.character}`,
    ...Object.entries(chart.elements).map(([element, count]) => `오행:${element}${count}`),
  ];
  if (yearFlow) refs.push(`대상연도:${yearFlow.targetYear}`, `연주:${yearFlow.pillar}`);
  return refs;
}

export function parseWholeReading(
  value: unknown,
  chart: SajuChart,
  kind: ReadingKind,
  yearFlow?: YearFlow,
): WholeReading {
  if (!isRecord(value) || value.version !== 2 || value.kind !== kind || !Array.isArray(value.sections))
    throw new GeminiContractError("전체 사주 해석 결과의 형식이 올바르지 않습니다.");

  const expected = kind === "lifetime"
    ? ["nature", "strengths", "relationships", "work", "money"]
    : ["overview", "relationships", "work", "money"];
  if (value.sections.length !== expected.length)
    throw new GeminiContractError("필요한 해석 항목이 모두 포함되지 않았습니다.");
  if (kind === "yearly" && value.targetYear !== yearFlow?.targetYear)
    throw new GeminiContractError("선택한 연도와 해석 연도가 일치하지 않습니다.");

  const allowedRefs = new Set(chartEvidenceRefs(chart, yearFlow));
  const seen = new Set<string>();
  const sections = value.sections.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || !expected.includes(raw.id))
      throw new GeminiContractError("해석 항목 종류가 올바르지 않습니다.");
    if (seen.has(raw.id)) throw new GeminiContractError("해석 항목이 중복되었습니다.");
    seen.add(raw.id);
    if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length === 0)
      throw new GeminiContractError("계산 근거가 필요합니다.");
    const evidenceRefs = raw.evidenceRefs.map((item) => requiredString(item, "계산 근거", 30));
    if (evidenceRefs.some((item) => !allowedRefs.has(item)))
      throw new GeminiContractError("계산 결과에 없는 근거가 포함되었습니다.");
    return {
      id: raw.id as WholeReadingSectionId,
      title: requiredString(raw.title, "제목", 80),
      summary: requiredString(raw.summary, "요약"),
      evidence: requiredString(raw.evidence, "근거 설명"),
      evidenceRefs,
      realityCheck: requiredString(raw.realityCheck, "현실 점검", 500),
      action: requiredString(raw.action, "다음 행동", 500),
    };
  });
  if (expected.some((id) => !seen.has(id)))
    throw new GeminiContractError("필요한 해석 항목이 빠졌습니다.");

  return {
    version: 2,
    kind,
    ...(kind === "yearly" ? { targetYear: yearFlow?.targetYear } : {}),
    headline: requiredString(value.headline, "한 줄 요약", 500),
    sections,
    disclaimer: requiredString(value.disclaimer, "참고 안내", 500),
  };
}

export function buildWholeReadingPrompt(
  chart: SajuChart,
  kind: ReadingKind,
  yearFlow?: YearFlow,
): string {
  const sectionIds = kind === "lifetime"
    ? ["nature", "strengths", "relationships", "work", "money"]
    : ["overview", "relationships", "work", "money"];
  const mode = kind === "lifetime"
    ? "변하지 않는 바탕과 삶 전반의 반복 경향"
    : `${yearFlow?.targetYear}년의 전체 방향과 관계·일·돈의 가능성`;
  return `당신은 계산된 사주를 쉬운 한국어로 설명하는 도우미입니다. ${mode}을 설명하세요.

[규칙]
- 계산을 다시 하거나 사건·직업·관계·수익을 단정하지 마세요.
- evidenceRefs에는 아래 허용 근거 문자열만 정확히 사용하세요.
- 오행 개수는 대표 8자 집계이며 강약·길흉 확정값이 아닙니다.
- 각 항목에 현실에서 확인할 질문과 실행 가능한 다음 행동을 넣으세요.
- 전문 용어에는 쉬운 뜻을 붙이세요.
- JSON만 출력하세요.

[계산 결과]
${JSON.stringify({
  pillars: chart.pillars.map(({ label, text, korean, stemElement, branchElement }) => ({ label, text, korean, stemElement, branchElement })),
  dayMaster: chart.dayMaster,
  elements: chart.elements,
  elementNotice: chart.elementMethod,
  yearFlow,
})}

[허용 근거]
${JSON.stringify(chartEvidenceRefs(chart, yearFlow))}

[필수 section id 순서]
${JSON.stringify(sectionIds)}`;
}

export function wholeReadingResponseSchema(chart: SajuChart, kind: ReadingKind, yearFlow?: YearFlow) {
  const ids = kind === "lifetime"
    ? ["nature", "strengths", "relationships", "work", "money"]
    : ["overview", "relationships", "work", "money"];
  return {
    type: "object",
    properties: {
      version: { type: "integer", enum: [2] },
      kind: { type: "string", enum: [kind] },
      ...(kind === "yearly" ? { targetYear: { type: "integer", enum: [yearFlow?.targetYear] } } : {}),
      headline: { type: "string" },
      sections: {
        type: "array",
        minItems: ids.length,
        maxItems: ids.length,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: ids },
            title: { type: "string" },
            summary: { type: "string" },
            evidence: { type: "string" },
            evidenceRefs: { type: "array", minItems: 1, items: { type: "string", enum: chartEvidenceRefs(chart, yearFlow) } },
            realityCheck: { type: "string" },
            action: { type: "string" },
          },
          required: ["id", "title", "summary", "evidence", "evidenceRefs", "realityCheck", "action"],
        },
      },
      disclaimer: { type: "string" },
    },
    required: ["version", "kind", ...(kind === "yearly" ? ["targetYear"] : []), "headline", "sections", "disclaimer"],
  };
}
