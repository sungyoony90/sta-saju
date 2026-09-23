import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/readings/route";
import { calculate } from "../lib/saju/chart";
import {
  buildReadingPrompt,
  GeminiContractError,
  parseGeminiReading,
  sanitizeChart,
  sanitizeContext,
  sanitizeConversation,
  type GeminiReading,
} from "../lib/saju/gemini-contract";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "career",
  question: "",
});

const context = {
  employment: "재직 중",
  concern: "소득과 이직 방향",
  timing: "3개월 안",
  situation: "현재 직무의 성장 기회가 적어 이직을 준비하고 있습니다.",
  question: "연봉과 성장 가능성 중 무엇을 먼저 비교해야 할까요?",
};

const validReading: GeminiReading = {
  version: 1,
  cards: [
    {
      id: "career",
      title: "직업·이직 방향",
      summary: "현재는 준비를 먼저 시작하는 편이 좋습니다.",
      evidence: "일간과 대표 오행을 참고한 해석입니다.",
      action: "채용 공고 세 개를 비교해보세요.",
    },
    {
      id: "core",
      title: "핵심 성향",
      summary: "기준을 세워 판단할 때 강점이 드러납니다.",
      evidence: "계산된 일간을 쉬운 말로 풀었습니다.",
      action: "중요 조건 세 가지를 적어보세요.",
    },
    {
      id: "timing",
      title: "가까운 시기의 흐름",
      summary: "성급한 퇴사보다 탐색이 우선입니다.",
      evidence: "현재 상황과 계산 결과를 함께 참고했습니다.",
      action: "3개월 계획을 주 단위로 나눠보세요.",
    },
  ],
  conclusion: "지금은 이직 준비를 시작하는 쪽을 추천합니다.",
  realityChecks: ["생활비와 실제 채용 상황을 함께 확인하세요."],
  disclaimer: "사주 해석은 참고 자료이며 미래를 보장하지 않습니다.",
};

test("정상 Gemini JSON 구조를 파싱한다", () => {
  assert.deepEqual(parseGeminiReading(validReading), validReading);
});

test("생년월일과 출생시간 원문 및 허용하지 않은 개인정보를 프롬프트에서 제외한다", () => {
  const birthDate = "2005-12-23";
  const birthTime = "08:37";
  const apiKey = "secret-api-key-that-must-not-leak";
  const email = "private@example.com";

  const safeChart = sanitizeChart({
    ...chart,
    birthDate,
    birthTime,
    apiKey,
    pillars: chart.pillars.map((pillar) => ({
      ...pillar,
      birthDate,
      privateMemo: "민감한 원문",
    })),
  });
  const safeContext = sanitizeContext({
    ...context,
    birthDate,
    birthTime,
    apiKey,
    email,
  });
  const prompt = buildReadingPrompt(safeChart, safeContext);

  assert.doesNotMatch(prompt, new RegExp(birthDate));
  assert.doesNotMatch(prompt, new RegExp(birthTime));
  assert.doesNotMatch(prompt, new RegExp(apiKey));
  assert.doesNotMatch(prompt, new RegExp(email.replace(".", "\\.")));
  assert.doesNotMatch(prompt, /birthDate|birthTime|apiKey|privateMemo|email/);
  assert.match(prompt, /재직 중/);
  assert.match(prompt, new RegExp(chart.dayMaster.korean));
});

test("필수 카드가 빠진 응답을 거절한다", () => {
  assert.throws(
    () => parseGeminiReading({ ...validReading, cards: validReading.cards.slice(0, 2) }),
    (error: unknown) =>
      error instanceof GeminiContractError && /세 개/.test(error.message),
  );
});

test("카드가 세 개여도 같은 종류가 중복되면 거절한다", () => {
  assert.throws(
    () =>
      parseGeminiReading({
        ...validReading,
        cards: [
          validReading.cards[0],
          validReading.cards[0],
          validReading.cards[2],
        ],
      }),
    (error: unknown) =>
      error instanceof GeminiContractError && /중복/.test(error.message),
  );
});

test("후속 질문은 이전 대화 2회까지 호출 가능하고 3회가 쌓이면 API 호출 전에 차단한다", async () => {
  const twoTurns = [
    { question: "첫 질문", answer: "첫 답변" },
    { question: "둘째 질문", answer: "둘째 답변" },
  ];
  assert.equal(sanitizeConversation(twoTurns).length, 2);

  const threeTurns = [
    ...twoTurns,
    { question: "셋째 질문", answer: "셋째 답변" },
  ];
  const response = await POST(
    new Request("http://localhost/api/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "followup",
        chart,
        context,
        conversation: threeTurns,
        question: "네 번째 질문",
      }),
    }),
  );
  const payload = (await response.json()) as { code: string; error: string };

  assert.equal(response.status, 400);
  assert.equal(payload.code, "invalid_request");
  assert.match(payload.error, /최대 3회/);
});

test("sanitize 함수는 민감하거나 과도한 추가 필드를 결과에서 제거한다", () => {
  const safeChart = sanitizeChart({
    ...chart,
    date: "2005-12-23",
    time: "08:37",
    apiKey: "secret",
    debug: { rawRequest: true },
    pillars: chart.pillars.map((pillar) => ({
      ...pillar,
      email: "private@example.com",
      internalScore: 99,
    })),
  });
  const safeContext = sanitizeContext({
    ...context,
    name: "홍길동",
    email: "private@example.com",
    phone: "010-0000-0000",
    apiKey: "secret",
  });
  const safeConversation = sanitizeConversation([
    {
      question: "무엇을 준비할까요?",
      answer: "현실 조건을 먼저 확인하세요.",
      email: "private@example.com",
      token: "secret",
      metadata: { hidden: true },
    },
  ]);

  assert.deepEqual(safeChart, chart);
  assert.deepEqual(safeContext, context);
  assert.deepEqual(safeConversation, [
    {
      question: "무엇을 준비할까요?",
      answer: "현실 조건을 먼저 확인하세요.",
    },
  ]);
  assert.equal("date" in safeChart, false);
  assert.equal("email" in safeContext, false);
  assert.equal("token" in safeConversation[0], false);
});

test("Gemini REST 요청은 JSON 응답 MIME 타입을 APPLICATION_JSON으로 지정한다", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;

  process.env.GEMINI_API_KEY = "test-key-for-request-contract";
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(validReading) }] } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart, context }),
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(
      (
        requestBody as {
          generationConfig: { responseFormat: { text: { mimeType: string } } };
        }
      ).generationConfig.responseFormat.text.mimeType,
      "APPLICATION_JSON",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
