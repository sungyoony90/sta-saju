import test from "node:test";
import assert from "node:assert/strict";
import { calculate, validateInput, type SajuInput } from "../lib/saju/chart";

const base: SajuInput = {
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "general",
  question: "",
};

// lunar-javascript가 공개한 기준 사례를 사용한다.
for (const [date, time, expected] of [
  ["2005-12-23", "08:37", ["乙酉", "戊子", "辛巳", "壬辰"]],
  ["1999-06-07", "09:11", ["己卯", "庚午", "庚寅", "辛巳"]],
] as const)
  test(`공개 기준 사례 ${date}`, () =>
    assert.deepEqual(
      calculate({ ...base, date, time }).pillars.map((item) => item.text),
      expected,
    ));

test("한국 시각의 입춘 경계에서 년주와 월주가 바뀐다", () => {
  assert.deepEqual(
    calculate({ ...base, date: "2024-02-04", time: "17:26" })
      .pillars.slice(0, 2)
      .map((item) => item.text),
    ["癸卯", "乙丑"],
  );
  assert.deepEqual(
    calculate({ ...base, date: "2024-02-04", time: "17:28" })
      .pillars.slice(0, 2)
      .map((item) => item.text),
    ["甲辰", "丙寅"],
  );
});

test("23시에 다음 날의 일주로 바뀐다", () => {
  const before = calculate({ ...base, date: "2000-06-15", time: "22:59" });
  const after = calculate({ ...base, date: "2000-06-15", time: "23:00" });
  const midnight = calculate({ ...base, date: "2000-06-16", time: "00:00" });
  assert.notEqual(before.pillars[2].text, after.pillars[2].text);
  assert.equal(after.pillars[2].text, midnight.pillars[2].text);
  assert.equal(after.pillars[3].text, midnight.pillars[3].text);
});

for (const [changes, message] of [
  [{ date: "2001-02-29" }, "존재"],
  [{ date: "2000-02-30" }, "존재"],
  [{ date: "1989-12-31" }, "1990"],
  [{ time: "24:00" }, "시각"],
  [{ time: "12:60" }, "시각"],
  [{ unknownTime: true }, "출생 시각"],
  [{ calendar: "lunar" }, "양력"],
  [{ question: "x".repeat(201) }, "200자"],
  [{ topic: "anything" }, "주제"],
] as const)
  test(`지원하지 않는 입력 ${JSON.stringify(changes).slice(0, 60)}`, () =>
    assert.throws(
      () => validateInput({ ...base, ...changes } as SajuInput),
      new RegExp(message),
    ));

test("윤일을 계산하고 대표 오행 합계가 여덟이다", () => {
  const chart = calculate({ ...base, date: "2000-02-29" });
  assert.equal(
    Object.values(chart.elements).reduce((sum, count) => sum + count, 0),
    8,
  );
});

test("일주를 한글 간지로 표시할 수 있다", () => {
  const chart = calculate({
    ...base,
    date: "2024-02-03",
    time: "12:00",
  });
  assert.equal(chart.pillars[2].text, "丁酉");
  assert.equal(chart.pillars[2].korean, "정유");
  assert.equal(
    chart.dayMaster.korean + chart.dayMaster.element,
    "정화",
  );
});

test("불필요한 개인정보와 클라이언트 계산값을 무시한다", () => {
  const input = validateInput({
    ...base,
    nickname: "private",
    email: "private",
    chart: "fake",
  } as SajuInput);
  assert.equal("nickname" in input, false);
  assert.equal("email" in input, false);
  assert.equal("chart" in input, false);
});
