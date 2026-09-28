import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculate } from "../lib/saju/chart";
import { GeminiContractError } from "../lib/saju/gemini-contract";
import { buildSavedReadingInsert, parseSavedReading } from "../lib/saju/saved-reading";
import {
  calculateYearFlow,
  calculateYearPillarAt,
  getKoreanCurrentYear,
  validateTargetYear,
  YearFlowError,
  type YearFlow,
} from "../lib/saju/year-flow";
import {
  buildYearlyReadingPrompt,
  parseYearlyReading,
  type YearlyReading,
} from "../lib/saju/yearly-reading";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "general",
  question: "",
});

const yearFlow: YearFlow = {
  targetYear: 2026,
  pillar: "丙午",
  korean: "병오",
  boundary: "입춘",
};

const validReading: YearlyReading = {
  kind: "yearly",
  version: 1,
  targetYear: 2026,
  yearPillar: "丙午",
  cards: [
    {
      id: "overall",
      title: "전체 방향",
      summary: "가능성을 살피되 현실 조건을 함께 확인하세요.",
      evidence: "출생 원국과 병오 연주를 함께 참고했습니다.",
      action: "올해 남은 계획의 우선순위를 적어보세요.",
    },
    {
      id: "relationship",
      title: "관계",
      summary: "상대의 상황을 확인하며 대화하세요.",
      evidence: "출생 원국과 병오 연주의 관계를 참고했습니다.",
      action: "중요한 대화 전에 확인할 질문을 적어보세요.",
    },
    {
      id: "work",
      title: "일",
      summary: "선택지를 비교하며 준비할 수 있습니다.",
      evidence: "출생 원국과 병오 연주의 일 흐름을 참고했습니다.",
      action: "실제 일정과 필요한 자원을 확인하세요.",
    },
    {
      id: "money",
      title: "돈",
      summary: "수익을 단정하지 말고 손실 가능성도 살피세요.",
      evidence: "출생 원국과 병오 연주의 돈 흐름을 참고했습니다.",
      action: "예산과 감당 가능한 손실 범위를 확인하세요.",
    },
  ],
  conclusion: "올해 남은 기간은 현실 조건을 확인하며 선택지를 좁혀가세요.",
  realityChecks: ["일정, 상대의 의사, 예산을 실제 정보로 확인하세요."],
  disclaimer: "사주 해석은 참고 자료이며 특정 사건이나 결과를 보장하지 않습니다.",
};

test("한국 표준시 자정에 올해가 바뀐다", () => {
  assert.equal(
    getKoreanCurrentYear(new Date("2025-12-31T14:59:59.999Z")),
    2025,
  );
  assert.equal(
    getKoreanCurrentYear(new Date("2025-12-31T15:00:00.000Z")),
    2026,
  );
});

test("올해, 올해+1, 올해+5를 선택할 수 있고 대상 연주를 계산한다", () => {
  const currentYear = 2026;

  assert.deepEqual(calculateYearFlow(currentYear, currentYear), {
    targetYear: 2026,
    pillar: "丙午",
    korean: "병오",
    boundary: "입춘",
  });
  assert.equal(calculateYearFlow(currentYear + 1, currentYear).targetYear, 2027);
  assert.equal(calculateYearFlow(currentYear + 5, currentYear).targetYear, 2031);
});

test("과거 연도, 올해+6, 정수가 아닌 연도를 거절한다", () => {
  for (const targetYear of [2025, 2032, 2026.5, "2026", null]) {
    assert.throws(
      () => validateTargetYear(targetYear, 2026),
      (error: unknown) =>
        error instanceof YearFlowError &&
        (Number.isInteger(targetYear)
          ? /2026년부터 2031년까지/.test(error.message)
          : /연도를 선택/.test(error.message)),
    );
  }
});

test("2024년 한국 시각 입춘 직전과 직후에 연주가 바뀐다", () => {
  assert.equal(calculateYearPillarAt("2024-02-04", "17:26"), "癸卯");
  assert.equal(calculateYearPillarAt("2024-02-04", "17:28"), "甲辰");
});

test("Gemini가 요청과 다른 대상 연도나 연주를 반환하면 거절한다", () => {
  assert.throws(
    () => parseYearlyReading({ ...validReading, targetYear: 2027 }, yearFlow),
    (error: unknown) =>
      error instanceof GeminiContractError && /요청과 일치하지/.test(error.message),
  );
  assert.throws(
    () => parseYearlyReading({ ...validReading, yearPillar: "丁未" }, yearFlow),
    (error: unknown) =>
      error instanceof GeminiContractError && /요청과 일치하지/.test(error.message),
  );
});

test("Gemini 연도 풀이에 카드 종류가 중복되면 거절한다", () => {
  assert.throws(
    () =>
      parseYearlyReading(
        {
          ...validReading,
          cards: [
            validReading.cards[0],
            validReading.cards[0],
            validReading.cards[2],
            validReading.cards[3],
          ],
        },
        yearFlow,
      ),
    (error: unknown) =>
      error instanceof GeminiContractError && /중복/.test(error.message),
  );
});

test("올해 프롬프트는 오늘 이후만 안내하고 출생 원문을 포함하지 않는다", () => {
  const birthDate = "2005-12-23";
  const birthTime = "08:37";
  const prompt = buildYearlyReadingPrompt(
    {
      ...chart,
      birthDate,
      birthTime,
      privateMemo: "Gemini에 보내면 안 되는 원문",
    } as typeof chart,
    yearFlow,
    2026,
    "2026-09-28",
  );

  assert.match(prompt, /한국 시각 2026-09-28 이후의 흐름만 설명/);
  assert.match(prompt, /이미 지난 일을 예언하지 마세요/);
  assert.doesNotMatch(prompt, new RegExp(birthDate));
  assert.doesNotMatch(prompt, new RegExp(birthTime));
  assert.doesNotMatch(prompt, /birthDate|birthTime|privateMemo|Gemini에 보내면 안 되는 원문/);
  assert.match(prompt, /"targetYear":2026/);
  assert.match(prompt, /"yearPillar":"丙午"/);
});

test("연도 풀이를 저장하고 다시 읽으면 대상 연도와 종류가 복원된다", () => {
  const insert = buildSavedReadingInsert(chart, validReading, "gemini-3.5-flash-lite");
  const parsed = parseSavedReading({
    id: "f27b3f6a-a56c-4f2f-8a57-684c824117bd",
    created_at: "2026-09-28T12:34:56.000Z",
    ...insert,
  });

  assert.equal(parsed.kind, "yearly");
  assert.equal(parsed.targetYear, 2026);
  assert.equal(
    "targetYear" in parsed.reading ? parsed.reading.targetYear : undefined,
    2026,
  );
  assert.deepEqual(parsed.reading, validReading);
});

test("저장된 연도 풀이를 열 때 대상 연도를 복원하고 연도 변경 시 이전 결과를 초기화한다", () => {
  const source = readFileSync(
    new URL("../app/saju-form.tsx", import.meta.url),
    "utf8",
  );
  const restoreStart = source.indexOf("function showSavedReading");
  const restoreEnd = source.indexOf(
    "async function handleDeleteSavedReading",
    restoreStart,
  );
  const changeYearStart = source.indexOf("function changeTargetYear");
  const changeYearEnd = source.indexOf(
    "async function handleYearlyReading",
    changeYearStart,
  );
  const restoreBody = source.slice(restoreStart, restoreEnd);
  const changeYearBody = source.slice(changeYearStart, changeYearEnd);

  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, "저장 결과 열기 함수가 있어야 합니다.");
  assert.match(restoreBody, /item\.kind\s*===\s*["']yearly["']/);
  assert.match(restoreBody, /setTargetYear\(item\.targetYear\)/);
  assert.match(
    restoreBody,
    /setYearFlow\(calculateYearFlow\(item\.targetYear,\s*item\.targetYear\)\)/,
  );

  assert.ok(
    changeYearStart >= 0 && changeYearEnd > changeYearStart,
    "대상 연도 변경 함수가 있어야 합니다.",
  );
  assert.match(changeYearBody, /setTargetYear\(year\)/);
  assert.match(changeYearBody, /setReading\(\[\]\)/);
  assert.match(changeYearBody, /setReadingMeta\(null\)/);
  assert.match(changeYearBody, /setReadingError\(["']["']\)/);
  assert.match(changeYearBody, /setModelName\(["']["']\)/);
  assert.match(changeYearBody, /setActiveSavedId\(null\)/);
  assert.match(changeYearBody, /setIsRestoredReading\(false\)/);
  assert.match(changeYearBody, /setYearFlow\(null\)/);
});
