import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculate } from "../lib/saju/chart";
import type { GeminiReading } from "../lib/saju/gemini-contract";
import { buildSavedReadingInsert, parseSavedReading } from "../lib/saju/saved-reading";
import {
  buildWholeReadingPrompt,
  chartEvidenceRefs,
  parseWholeReading,
  type ReadingKind,
  type WholeReading,
  type WholeReadingSectionId,
} from "../lib/saju/whole-reading";
import {
  calculateYearFlow,
  getKoreanCurrentYear,
  validateTargetYear,
  YearFlowError,
  type YearFlow,
} from "../lib/saju/year-flow";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "career",
  question: "",
});

const lifetimeIds: WholeReadingSectionId[] = [
  "nature",
  "strengths",
  "relationships",
  "work",
  "money",
];
const yearlyIds: WholeReadingSectionId[] = ["overview", "relationships", "work", "money"];

function makeWholeReading(kind: ReadingKind, yearFlow?: YearFlow): WholeReading {
  const ids = kind === "lifetime" ? lifetimeIds : yearlyIds;
  const refs = chartEvidenceRefs(chart, yearFlow);
  return {
    version: 2,
    kind,
    ...(kind === "yearly" ? { targetYear: yearFlow?.targetYear } : {}),
    headline: kind === "lifetime" ? "삶 전반의 경향을 살펴봅니다." : "선택한 해의 흐름을 살펴봅니다.",
    sections: ids.map((id, index) => ({
      id,
      title: `${id} 제목`,
      summary: `${id} 요약`,
      evidence: `${id} 근거 설명`,
      evidenceRefs: [refs[index % refs.length]],
      realityCheck: `${id} 현실 점검`,
      action: `${id} 다음 행동`,
    })),
    disclaimer: "사주 해석은 참고 자료이며 미래를 보장하지 않습니다.",
  };
}

const legacyReading: GeminiReading = {
  version: 1,
  cards: [
    { id: "career", title: "진로", summary: "준비", evidence: "일간", action: "확인" },
    { id: "core", title: "성향", summary: "비교", evidence: "오행", action: "기록" },
    { id: "timing", title: "시기", summary: "탐색", evidence: "사주", action: "계획" },
  ],
  conclusion: "준비를 시작하세요.",
  realityChecks: ["현실 조건을 확인하세요."],
  disclaimer: "참고 자료입니다.",
};

const baseRow = {
  id: "f27b3f6a-a56c-4f2f-8a57-684c824117bd",
  created_at: "2026-09-28T12:34:56.000Z",
  chart,
  model: "gemini-3.5-flash-lite",
};

test("한국 시간의 현재 연도를 구하고 올해부터 5년 뒤까지만 허용한다", () => {
  assert.equal(getKoreanCurrentYear(new Date("2025-12-31T14:59:59.000Z")), 2025);
  assert.equal(getKoreanCurrentYear(new Date("2025-12-31T15:00:00.000Z")), 2026);

  assert.equal(validateTargetYear(2026, 2026), 2026);
  assert.equal(validateTargetYear(2027, 2026), 2027);
  assert.equal(validateTargetYear(2031, 2026), 2031);
  for (const invalid of [2025, 2032, 2026.5, "2026", undefined]) {
    assert.throws(
      () => validateTargetYear(invalid, 2026),
      (error: unknown) => error instanceof YearFlowError,
    );
  }
});

test("선택 연도의 입춘 기준 대표 간지를 계산한다", () => {
  assert.deepEqual(calculateYearFlow(2026, 2026), {
    targetYear: 2026,
    pillar: "丙午",
    korean: "병오",
    boundary: "입춘",
  });
  assert.deepEqual(calculateYearFlow(2031, 2026), {
    targetYear: 2031,
    pillar: "辛亥",
    korean: "신해",
    boundary: "입춘",
  });
});

test("정상 lifetime 및 yearly 전체 풀이를 계산 근거와 함께 파싱한다", () => {
  const lifetime = makeWholeReading("lifetime");
  const yearFlow = calculateYearFlow(2027, 2026);
  const yearly = makeWholeReading("yearly", yearFlow);

  assert.deepEqual(parseWholeReading(lifetime, chart, "lifetime"), lifetime);
  assert.deepEqual(parseWholeReading(yearly, chart, "yearly", yearFlow), yearly);
});

test("계산값에 없는 evidenceRefs는 전체 풀이에서 거절한다", () => {
  const reading = makeWholeReading("lifetime");
  reading.sections[0] = {
    ...reading.sections[0],
    evidenceRefs: ["오행:수99"],
  };

  assert.throws(
    () => parseWholeReading(reading, chart, "lifetime"),
    /계산 결과에 없는 근거/,
  );
});

test("lifetime과 yearly의 필수 섹션 누락·중복 및 선택 연도 불일치를 거절한다", () => {
  const lifetime = makeWholeReading("lifetime");
  assert.throws(
    () => parseWholeReading({ ...lifetime, sections: lifetime.sections.slice(0, -1) }, chart, "lifetime"),
    /모두 포함/,
  );
  assert.throws(
    () => parseWholeReading({
      ...lifetime,
      sections: [lifetime.sections[0], lifetime.sections[0], ...lifetime.sections.slice(2)],
    }, chart, "lifetime"),
    /중복/,
  );

  const yearFlow = calculateYearFlow(2028, 2026);
  const yearly = makeWholeReading("yearly", yearFlow);
  assert.throws(
    () => parseWholeReading({ ...yearly, sections: yearly.sections.slice(0, -1) }, chart, "yearly", yearFlow),
    /모두 포함/,
  );
  assert.throws(
    () => parseWholeReading({ ...yearly, targetYear: 2029 }, chart, "yearly", yearFlow),
    /연도가 일치하지/,
  );
});

test("v1 기록과 v2 lifetime/yearly 기록을 모두 저장 후 복원한다", () => {
  const lifetime = makeWholeReading("lifetime");
  const yearFlow = calculateYearFlow(2029, 2026);
  const yearly = makeWholeReading("yearly", yearFlow);

  const cases = [
    { reading: legacyReading, yearFlow: undefined },
    { reading: lifetime, yearFlow: undefined },
    { reading: yearly, yearFlow },
  ] as const;

  for (const item of cases) {
    const insert = buildSavedReadingInsert(chart, item.reading, baseRow.model, item.yearFlow);
    const restored = parseSavedReading({ ...baseRow, ...insert });
    assert.deepEqual(restored.chart, chart);
    assert.deepEqual(restored.reading, item.reading);
  }
});

test("v2 프롬프트와 저장 payload에 생년월일·출생시간 원문 및 임의 개인정보를 넣지 않는다", () => {
  const birthDate = "2005-12-23";
  const birthTime = "08:37";
  const email = "private@example.com";
  const pollutedChart = {
    ...chart,
    birthDate,
    birthTime,
    email,
    question: "비공개 질문 원문",
    pillars: chart.pillars.map((pillar) => ({ ...pillar, privateMemo: "민감 정보" })),
  } as typeof chart;
  const reading = makeWholeReading("lifetime");
  const prompt = buildWholeReadingPrompt(pollutedChart, "lifetime");
  const serializedInsert = JSON.stringify(
    buildSavedReadingInsert(pollutedChart, reading, baseRow.model),
  );

  for (const forbidden of [birthDate, birthTime, email, "비공개 질문 원문", "민감 정보"]) {
    assert.equal(prompt.includes(forbidden), false);
    assert.equal(serializedInsert.includes(forbidden), false);
  }
  assert.doesNotMatch(prompt, /birthDate|birthTime|privateMemo|email/);
  assert.doesNotMatch(serializedInsert, /birthDate|birthTime|question|privateMemo|email/);
});

test("화면은 연도별 탭·6개 연도 선택·오늘 이후 안내와 오행·용어 근거를 제공한다", () => {
  const source = readFileSync(new URL("../app/saju-form.tsx", import.meta.url), "utf8");

  assert.match(source, /role="tablist"[^>]*aria-label="풀이 종류"/);
  assert.match(source, /role="tab"\s+aria-selected=\{mode === "yearly"\}[\s\S]{0,180}앞으로의 흐름/);
  assert.match(source, /setMode\("yearly"\);\s*setReading\(null\)/);
  assert.match(source, /<select id="target-year"[\s\S]*?setTargetYear\(Number\(event\.target\.value\)\);\s*setReading\(null\)/);
  assert.match(source, /Array\.from\(\{ length: 6 \}, \(_, index\) => currentYear \+ index\)/);
  assert.match(source, /오늘 이후/);
  assert.match(source, /연도 경계는 입춘 기준/);
  assert.match(source, /특정 날짜의 사건을 예측하지 않습니다/);

  assert.match(source, /대표 오행 8자/);
  assert.match(source, /aria-label="오행 대표 개수"/);
  assert.match(source, /Object\.values\(chart\.elements\)\.reduce/);
  assert.match(source, /왜 이렇게 읽었나요\?/);
  for (const term of ["년주", "월주", "일주", "시주", "일간", "오행"]) {
    assert.match(source, new RegExp(`\\["${term}",`));
  }
});
