import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/readings/route";
import { calculate } from "../lib/saju/chart";
import type { GeminiReading } from "../lib/saju/gemini-contract";
import { GeminiContractError } from "../lib/saju/gemini-contract";
import { buildSavedReadingInsert, parseSavedReading } from "../lib/saju/saved-reading";
import {
  buildWholeReadingPrompt,
  chartEvidenceRefs,
  parseWholeReading,
  wholeReadingResponseSchema,
  type WholeReading,
} from "../lib/saju/whole-reading";

const birthDate = "2005-12-23";
const birthTime = "08:37";
const chart = calculate({
  date: birthDate,
  time: birthTime,
  calendar: "solar",
  topic: "career",
  question: "",
});
const evidenceRef = chartEvidenceRefs(chart)[0];

const sectionIds = ["nature", "strengths", "relationships", "work", "money"] as const;
const lifetimeReading: WholeReading = {
  version: 2,
  kind: "lifetime",
  headline: "기준을 세우고 꾸준히 다듬을 때 강점이 드러납니다.",
  sections: sectionIds.map((id) => ({
    id,
    title: id,
    summary: `${id}의 반복 경향을 살펴봅니다.`,
    evidence: "계산된 원국의 한 요소를 삶의 경향과 연결했습니다.",
    evidenceRefs: [evidenceRef],
    realityCheck: "실제 경험에서도 같은 경향이 반복되는지 확인해보세요.",
    action: "최근 사례 하나를 적어보세요.",
  })),
  disclaimer: "사주 해석은 참고 자료이며 구체적인 미래를 보장하지 않습니다.",
};

const legacyReading: GeminiReading = {
  version: 1,
  cards: [
    { id: "career", title: "진로", summary: "준비하세요", evidence: "일간", action: "공고 확인" },
    { id: "core", title: "성향", summary: "비교하세요", evidence: "오행", action: "조건 기록" },
    { id: "timing", title: "시기", summary: "탐색하세요", evidence: "사주", action: "일정 작성" },
  ],
  conclusion: "준비를 시작하세요.",
  realityChecks: ["생활비를 확인하세요."],
  disclaimer: "참고 자료입니다.",
};

const savedRow = (reading: GeminiReading | WholeReading) => ({
  id: "f27b3f6a-a56c-4f2f-8a57-684c824117bd",
  created_at: "2026-09-23T12:34:56.000Z",
  chart,
  reading,
  model: "gemini-3.5-flash-lite",
});

test("취업 상태와 현재 고민 없이 lifetime API가 다섯 섹션을 반환한다", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  let sentPrompt = "";

  process.env.GEMINI_API_KEY = "test-key-for-lifetime";
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    sentPrompt = body.contents[0].parts[0].text;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(lifetimeReading) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "lifetime", chart }),
      }),
    );
    const payload = (await response.json()) as { reading: WholeReading };

    assert.equal(response.status, 200);
    assert.deepEqual(payload.reading.sections.map(({ id }) => id), sectionIds);
    assert.doesNotMatch(sentPrompt, /employment|concern|situation|question/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("lifetime 응답과 JSON schema는 정확히 다섯 종류의 섹션을 요구한다", () => {
  assert.deepEqual(parseWholeReading(lifetimeReading, chart, "lifetime"), lifetimeReading);

  const schema = wholeReadingResponseSchema(chart, "lifetime") as {
    properties: { sections: { minItems: number; maxItems: number; items: { properties: { id: { enum: string[] } } } } };
  };
  assert.equal(schema.properties.sections.minItems, 5);
  assert.equal(schema.properties.sections.maxItems, 5);
  assert.deepEqual(schema.properties.sections.items.properties.id.enum, [...sectionIds]);
});

test("누락·중복 섹션과 계산 결과에 없는 허위 근거를 거절한다", () => {
  assert.throws(
    () => parseWholeReading({ ...lifetimeReading, sections: lifetimeReading.sections.slice(0, 4) }, chart, "lifetime"),
    (error: unknown) => error instanceof GeminiContractError && /모두 포함/.test(error.message),
  );

  assert.throws(
    () => parseWholeReading({
      ...lifetimeReading,
      sections: [lifetimeReading.sections[0], lifetimeReading.sections[0], ...lifetimeReading.sections.slice(2)],
    }, chart, "lifetime"),
    (error: unknown) => error instanceof GeminiContractError && /중복/.test(error.message),
  );

  assert.throws(
    () => parseWholeReading({
      ...lifetimeReading,
      sections: lifetimeReading.sections.map((section, index) =>
        index === 0 ? { ...section, evidenceRefs: ["일간:존재하지않는값"] } : section),
    }, chart, "lifetime"),
    (error: unknown) => error instanceof GeminiContractError && /없는 근거/.test(error.message),
  );
});

test("전체 풀이 프롬프트에 생년월일·출생시간 원문이나 추가 개인정보를 넣지 않는다", () => {
  const prompt = buildWholeReadingPrompt({
    ...chart,
    birthDate,
    birthTime,
    email: "private@example.com",
  } as typeof chart, "lifetime");

  assert.doesNotMatch(prompt, new RegExp(birthDate));
  assert.doesNotMatch(prompt, new RegExp(birthTime));
  assert.doesNotMatch(prompt, /birthDate|birthTime|private@example\.com|email/);
  assert.match(prompt, new RegExp(chart.dayMaster.korean));
});

test("기존 version 1 저장 기록과 version 2 lifetime 기록을 모두 복원한다", () => {
  assert.deepEqual(parseSavedReading(savedRow(legacyReading)).reading, legacyReading);

  const insert = buildSavedReadingInsert(chart, lifetimeReading, "gemini-3.5-flash-lite");
  assert.deepEqual(insert.reading, lifetimeReading);
  assert.deepEqual(parseSavedReading(savedRow(lifetimeReading)).reading, lifetimeReading);
});
