import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/readings/route";
import { calculate } from "../lib/saju/chart";
import {
  buildDailyFortunePrompt,
  GeminiContractError,
  parseGeminiDailyFortune,
  sanitizeChart,
  type GeminiDailyFortune,
} from "../lib/saju/gemini-contract";
import {
  buildDailyFortuneContext,
  getKoreanDate,
} from "../lib/saju/daily-fortune";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "general",
  question: "",
});

const validDailyFortune: GeminiDailyFortune = {
  version: 1,
  headline: "오늘은 서두르기보다 우선순위를 정하는 날입니다.",
  cards: [
    {
      id: "overall",
      title: "전체 흐름",
      summary: "한 가지에 집중하면 흐름을 정리하기 좋습니다.",
      evidence: "출생 원국의 일간과 오늘 일진을 함께 참고했습니다.",
      action: "가장 중요한 일 하나를 먼저 적어보세요.",
    },
    {
      id: "workMoney",
      title: "일과 돈",
      summary: "새 지출보다 기존 계획을 점검하는 편이 좋습니다.",
      evidence: "원국의 대표 오행과 오늘 일진의 오행을 비교했습니다.",
      action: "결제 전에 예산을 한 번 더 확인하세요.",
    },
    {
      id: "relationship",
      title: "관계",
      summary: "결론보다 상대의 말을 먼저 확인해보세요.",
      evidence: "오늘 일진과 원국의 관계를 쉬운 말로 풀었습니다.",
      action: "중요한 대화에서는 질문을 하나 먼저 해보세요.",
    },
  ],
  caution: "큰 결정은 운세만으로 정하지 말고 현실 조건을 확인하세요.",
  disclaimer: "오늘의 운세는 참고 자료이며 결과를 보장하지 않습니다.",
};

test("Asia/Seoul 자정 경계에서 오늘 날짜가 바뀐다", () => {
  assert.equal(getKoreanDate(new Date("2026-09-27T14:59:59.999Z")), "2026-09-27");
  assert.equal(getKoreanDate(new Date("2026-09-27T15:00:00.000Z")), "2026-09-28");
  assert.equal(getKoreanDate(new Date("2026-09-27T23:30:00.000Z")), "2026-09-28");
});

test("고정 날짜의 오늘 일진을 항상 같은 값으로 계산한다", () => {
  const first = buildDailyFortuneContext("2026-09-28");
  const second = buildDailyFortuneContext("2026-09-28");

  assert.deepEqual(first, second);
  assert.equal(first.dateLabel, "2026년 9월 28일");
  assert.equal(first.dayPillar.text, "乙巳");
  assert.equal(first.dayPillar.korean, "을사");
  assert.equal(first.dayPillar.label, "오늘의 일진");
  assert.equal(first.timezone, "Asia/Seoul");
});

test("정상 오늘의 운세 Gemini JSON 구조를 파싱한다", () => {
  assert.deepEqual(parseGeminiDailyFortune(validDailyFortune), validDailyFortune);
});

test("오늘의 운세 카드가 누락된 Gemini 응답을 거절한다", () => {
  assert.throws(
    () =>
      parseGeminiDailyFortune({
        ...validDailyFortune,
        cards: validDailyFortune.cards.slice(0, 2),
      }),
    (error: unknown) =>
      error instanceof GeminiContractError && /세 개/.test(error.message),
  );
});

test("오늘의 운세 카드 종류가 중복된 Gemini 응답을 거절한다", () => {
  assert.throws(
    () =>
      parseGeminiDailyFortune({
        ...validDailyFortune,
        cards: [
          validDailyFortune.cards[0],
          validDailyFortune.cards[0],
          validDailyFortune.cards[2],
        ],
      }),
    (error: unknown) =>
      error instanceof GeminiContractError && /중복/.test(error.message),
  );
});

test("오늘의 운세 프롬프트에서 생년월일과 출생시간 원문을 제외한다", () => {
  const birthDate = "2005-12-23";
  const birthTime = "08:37";
  const safeChart = sanitizeChart({
    ...chart,
    birthDate,
    birthTime,
    pillars: chart.pillars.map((pillar) => ({
      ...pillar,
      birthDate,
      birthTime,
    })),
  });
  const daily = buildDailyFortuneContext("2026-09-28");
  const prompt = buildDailyFortunePrompt(safeChart, daily);

  assert.doesNotMatch(prompt, new RegExp(birthDate));
  assert.doesNotMatch(prompt, new RegExp(birthTime));
  assert.doesNotMatch(prompt, /birthDate|birthTime/);
  assert.match(prompt, /2026-09-28/);
  assert.match(prompt, new RegExp(daily.dayPillar.text));
  assert.match(prompt, new RegExp(chart.dayMaster.korean));
});

test("daily API는 클라이언트가 보낸 날짜를 무시하고 서버의 한국 날짜를 사용한다", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  const clientDate = "2099-12-31";
  let prompt = "";

  process.env.GEMINI_API_KEY = "test-key-for-daily-contract";
  globalThis.fetch = (async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    prompt = requestBody.contents[0].parts[0].text;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validDailyFortune) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const expectedDates = new Set([getKoreanDate()]);
    const response = await POST(
      new Request("http://localhost/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "daily", chart, date: clientDate }),
      }),
    );
    expectedDates.add(getKoreanDate());
    const payload = (await response.json()) as {
      daily: { date: string; timezone: string };
      fortune: GeminiDailyFortune;
    };

    assert.equal(response.status, 200);
    assert.equal(expectedDates.has(payload.daily.date), true);
    assert.equal(payload.daily.timezone, "Asia/Seoul");
    assert.notEqual(payload.daily.date, clientDate);
    assert.doesNotMatch(prompt, new RegExp(clientDate));
    assert.match(prompt, new RegExp(payload.daily.date));
    assert.deepEqual(payload.fortune, validDailyFortune);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
