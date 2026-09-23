import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import {
  createSampleFollowUp,
  createSampleReading,
  ReadingInputError,
  validateCareerContext,
  type CareerContext,
} from "../lib/saju/sample-reading";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "career",
  question: "",
});

const context: CareerContext = {
  employment: "재직 중",
  concern: "소득과 이직 방향",
  timing: "3개월 안",
  situation: "현재 직무의 성장 기회가 적어 이직을 준비하고 있습니다.",
  question: "연봉과 성장 가능성 중 무엇을 먼저 비교해야 할까요?",
};

test("정상 입력이면 세 카드가 사주와 현재 상황을 구체적으로 반영한다", () => {
  const cards = createSampleReading(chart, context);

  assert.deepEqual(
    cards.map(({ title }) => title),
    ["직업·이직 방향", "핵심 성향", "가까운 시기의 준비 방향"],
  );
  assert.equal(cards.length, 3);

  const output = cards
    .flatMap(({ summary, detail, action }) => [summary, detail, action])
    .join(" ");
  assert.match(output, /재직 중/);
  assert.match(output, /3개월 안/);
  assert.match(output, /소득과 이직 방향/);
  assert.match(output, /현재 직무의 성장 기회가 적어 이직을 준비/);
  assert.match(output, /연봉과 성장 가능성/);
  assert.match(
    output,
    new RegExp(`${chart.dayMaster.korean}${chart.dayMaster.element}`),
  );
  assert.ok(cards.every(({ detail, action }) => detail && action));
});

for (const [field, message] of [
  ["employment", "현재 상태"],
  ["concern", "가장 큰 고민"],
  ["timing", "변화 시점"],
  ["situation", "현재 상황"],
  ["question", "궁금한 질문"],
] as const) {
  test(`필수 입력 ${field} 누락 시 확인할 항목을 안내한다`, () => {
    assert.throws(
      () => validateCareerContext({ ...context, [field]: "   " }),
      (error: unknown) =>
        error instanceof ReadingInputError &&
        new RegExp(message).test(error.message),
    );
  });
}

test("재정 보장을 요구하는 질문에는 보장 거절과 현실 조건을 안내한다", () => {
  const answer = createSampleFollowUp(
    chart,
    context,
    "대출을 받아 전 재산을 투자하면 반드시 돈을 벌까요?",
    1,
  );

  assert.match(answer, /보장할 수는 없습니다/);
  assert.match(answer, /손실 가능성/);
  assert.match(answer, /비상자금/);
  assert.match(answer, /전문가 의견/);
  assert.match(answer, /작은 범위/);
  assert.doesNotMatch(answer, /반드시 (돈을 벌|성공)/);
});

test("후속 질문은 1회부터 3회까지만 허용한다", () => {
  for (const turn of [1, 2, 3]) {
    const answer = createSampleFollowUp(
      chart,
      context,
      `${turn}번째로 무엇을 준비하면 좋을까요?`,
      turn,
    );
    assert.match(answer, /재직 중/);
    assert.match(answer, /3개월 안/);
    assert.match(answer, /미래를 확정하지 않습니다/);
  }

  assert.throws(
    () => createSampleFollowUp(chart, context, "네 번째 질문입니다.", 4),
    (error: unknown) =>
      error instanceof ReadingInputError && /최대 3회/.test(error.message),
  );
});

