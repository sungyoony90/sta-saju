import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/readings/route";
import { calculate } from "../lib/saju/chart";
import {
  GeminiContractError,
  type GeminiReading,
} from "../lib/saju/gemini-contract";
import {
  buildLifetimePrompt,
  LIFETIME_CARD_IDS,
  parseLifetimeReading,
  type LifetimeReading,
} from "../lib/saju/lifetime-reading";
import {
  buildSavedReadingInsert,
  parseSavedReading,
} from "../lib/saju/saved-reading";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "career",
  question: "",
});

const cardTitles = ["성향", "강점과 주의점", "관계", "일", "돈"];

function makeLifetimeReading(): LifetimeReading {
  return {
    version: 1,
    kind: "lifetime",
    summary: "삶의 여러 영역에서 자신의 기준을 현실과 조율하는 경향이 있습니다.",
    cards: LIFETIME_CARD_IDS.map((id, index) => ({
      id,
      title: cardTitles[index],
      interpretation: `${cardTitles[index]} 영역의 반복 경향을 쉬운 말로 설명합니다.`,
      evidence: [`${chart.pillars[index % chart.pillars.length].text} 기둥을 참고했습니다.`],
      reflectionQuestion: `${cardTitles[index]}에서 실제로 반복되는 모습은 무엇인가요?`,
    })),
    disclaimer: "사주 풀이는 자기 이해를 위한 참고 자료이며 결과를 보장하지 않습니다.",
  };
}

const careerReading: GeminiReading = {
  version: 1,
  cards: [
    { id: "career", title: "진로", summary: "준비하세요.", evidence: "일간", action: "공고를 확인하세요." },
    { id: "core", title: "성향", summary: "비교하세요.", evidence: "오행", action: "조건을 적으세요." },
    { id: "timing", title: "시기", summary: "탐색하세요.", evidence: "원국", action: "일정을 만드세요." },
  ],
  conclusion: "준비를 시작하세요.",
  realityChecks: ["생활비를 확인하세요."],
  disclaimer: "참고 자료입니다.",
};

const rowBase = {
  id: "f27b3f6a-a56c-4f2f-8a57-684c824117bd",
  created_at: "2026-09-23T12:34:56.000Z",
  chart,
  model: "gemini-3.5-flash-lite",
};

test("전체 풀이의 다섯 카드를 정해진 순서로 파싱한다", () => {
  const reading = makeLifetimeReading();

  assert.deepEqual(parseLifetimeReading(reading, chart), reading);
  assert.deepEqual(
    reading.cards.map(({ id }) => id),
    ["temperament", "strengths", "relationships", "work", "money"],
  );
});

test("전체 풀이 카드의 누락, 중복, 순서 변경을 모두 거절한다", () => {
  const reading = makeLifetimeReading();
  const invalidCards = [
    reading.cards.slice(0, 4),
    [reading.cards[0], reading.cards[0], ...reading.cards.slice(2)],
    [reading.cards[1], reading.cards[0], ...reading.cards.slice(2)],
  ];

  for (const cards of invalidCards) {
    assert.throws(
      () => parseLifetimeReading({ ...reading, cards }, chart),
      GeminiContractError,
    );
  }
});

test("전체 풀이와 카드의 알 수 없는 추가 필드를 거절한다", () => {
  const reading = makeLifetimeReading();

  assert.throws(
    () => parseLifetimeReading({ ...reading, debug: "raw response" }, chart),
    GeminiContractError,
  );
  assert.throws(
    () =>
      parseLifetimeReading(
        {
          ...reading,
          cards: [
            { ...reading.cards[0], hiddenAdvice: "알 수 없는 필드" },
            ...reading.cards.slice(1),
          ],
        },
        chart,
      ),
    GeminiContractError,
  );
});

test("모든 전체 풀이 근거가 실제 계산값과 연결되어야 한다", () => {
  const reading = makeLifetimeReading();
  const replaceFirstEvidence = (evidence: string) => ({
    ...reading,
    cards: [
      { ...reading.cards[0], evidence: [evidence] },
      ...reading.cards.slice(1),
    ],
  });

  assert.throws(
    () => parseLifetimeReading(replaceFirstEvidence("甲子 기둥을 참고했습니다."), chart),
    (error: unknown) =>
      error instanceof GeminiContractError && /없는 간지/.test(error.message),
  );

  const wrongWoodCount = chart.elements.목 + 1;
  assert.throws(
    () =>
      parseLifetimeReading(
        replaceFirstEvidence(`목 오행 ${wrongWoodCount}개를 참고했습니다.`),
        chart,
      ),
    (error: unknown) =>
      error instanceof GeminiContractError && /다른 오행 개수/.test(error.message),
  );

  assert.throws(
    () => parseLifetimeReading(replaceFirstEvidence("균형과 조화를 참고했습니다."), chart),
    (error: unknown) =>
      error instanceof GeminiContractError && /연결되지 않았/.test(error.message),
  );

  assert.equal(
    parseLifetimeReading(
      replaceFirstEvidence(`목 오행 ${chart.elements.목}개를 참고했습니다.`),
      chart,
    ).cards[0].evidence[0],
    `목 오행 ${chart.elements.목}개를 참고했습니다.`,
  );
});

test("전체 풀이 프롬프트에는 계산값만 남고 출생 원문과 개인정보가 포함되지 않는다", () => {
  const birthDate = "2005-12-23";
  const birthTime = "08:37";
  const prompt = buildLifetimePrompt({
    ...chart,
    birthDate,
    birthTime,
    email: "private@example.com",
    apiKey: "secret-key",
    privateMemo: "사용자 원문",
  });

  assert.doesNotMatch(prompt, /2005-12-23|08:37|private@example\.com|secret-key|사용자 원문/);
  assert.doesNotMatch(prompt, /birthDate|birthTime|email|apiKey|privateMemo/);
  assert.match(prompt, new RegExp(chart.pillars[0].text));
  assert.match(prompt, new RegExp(chart.dayMaster.character));
});

test("API lifetime mode는 상담 context 없이 호출되며 민감한 원문을 Gemini에 보내지 않는다", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  const reading = makeLifetimeReading();
  let geminiBody = "";

  process.env.GEMINI_API_KEY = "test-lifetime-key";
  globalThis.fetch = (async (_input, init) => {
    geminiBody = String(init?.body);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "lifetime",
          chart: {
            ...chart,
            date: "2005-12-23",
            time: "08:37",
            email: "private@example.com",
          },
          context: {
            situation: "전송하면 안 되는 현재 상황 원문",
            question: "전송하면 안 되는 질문 원문",
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      model: string;
      reading: LifetimeReading;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.reading.kind, "lifetime");
    assert.deepEqual(payload.reading, reading);
    assert.doesNotMatch(
      geminiBody,
      /2005-12-23|08:37|private@example\.com|현재 상황 원문|질문 원문/,
    );
    assert.match(geminiBody, /"kind"/);
    assert.match(geminiBody, /"lifetime"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("기존 career 저장 기록과 lifetime 저장 기록을 각각 구분해 복원한다", () => {
  const lifetimeReading = makeLifetimeReading();
  const career = parseSavedReading({ ...rowBase, reading: careerReading });
  const lifetime = parseSavedReading({
    ...rowBase,
    id: "e5f5f14a-c283-49b1-a212-acde71608df7",
    reading: lifetimeReading,
  });

  assert.equal("kind" in career.reading, false);
  assert.equal(
    "kind" in lifetime.reading ? lifetime.reading.kind : undefined,
    "lifetime",
  );
  assert.deepEqual(career.reading, careerReading);
  assert.deepEqual(lifetime.reading, lifetimeReading);
});

test("lifetime 저장 payload는 종류와 버전을 유지하고 출생 원문을 제거한다", () => {
  const reading = makeLifetimeReading();
  const insert = buildSavedReadingInsert(
    {
      ...chart,
      date: "2005-12-23",
      time: "08:37",
      birthDate: "2005-12-23",
      birthTime: "08:37",
      email: "private@example.com",
    } as typeof chart,
    reading,
    "gemini-3.5-flash-lite",
  );
  const serialized = JSON.stringify(insert);

  assert.equal(
    "kind" in insert.reading ? insert.reading.kind : undefined,
    "lifetime",
  );
  assert.equal(insert.reading.version, 1);
  assert.deepEqual(insert.reading, reading);
  assert.doesNotMatch(serialized, /2005-12-23|08:37|private@example\.com/);
  assert.doesNotMatch(serialized, /"(date|time|birthDate|birthTime|email)"/);
});

test("깨진 lifetime 저장 기록은 거절하되 기존 career 기록에는 영향을 주지 않는다", () => {
  const lifetimeReading = makeLifetimeReading();

  assert.throws(() =>
    parseSavedReading({
      ...rowBase,
      reading: { ...lifetimeReading, cards: lifetimeReading.cards.slice(0, 4) },
    }),
  );
  assert.deepEqual(
    parseSavedReading({ ...rowBase, reading: careerReading }).reading,
    careerReading,
  );
});
