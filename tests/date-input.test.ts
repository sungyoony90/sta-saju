import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBirthDate,
  normalizeDatePart,
  splitPastedBirthDate,
} from "../lib/saju/date-input";

test("생년월일 각 구간은 숫자만 남기고 지정한 자리수로 제한한다", () => {
  assert.equal(normalizeDatePart("2005", 4), "2005");
  assert.equal(normalizeDatePart("20a0-5년", 4), "2005");
  assert.equal(normalizeDatePart("200512", 4), "2005");
  assert.equal(normalizeDatePart("1월2", 2), "12");
  assert.equal(normalizeDatePart("123", 2), "12");
  assert.equal(normalizeDatePart("", 2), "");
  assert.equal(normalizeDatePart("월일", 2), "");
});

test("연 4자리, 월 2자리, 일 2자리를 계산용 ISO 날짜 문자열로 조합한다", () => {
  assert.equal(formatBirthDate("2005", "12", "23"), "2005-12-23");
  assert.equal(formatBirthDate("1999", "06", "07"), "1999-06-07");
  assert.equal(formatBirthDate("", "", ""), "--");
});

test("8자리 생년월일 붙여넣기를 연, 월, 일로 분리한다", () => {
  assert.deepEqual(splitPastedBirthDate("20051223"), {
    year: "2005",
    month: "12",
    day: "23",
  });
  assert.deepEqual(splitPastedBirthDate("2005-12-23"), {
    year: "2005",
    month: "12",
    day: "23",
  });
  assert.deepEqual(splitPastedBirthDate("2005년 12월 23일"), {
    year: "2005",
    month: "12",
    day: "23",
  });
});

test("숫자가 정확히 8자리가 아닌 붙여넣기는 분리하지 않는다", () => {
  assert.equal(splitPastedBirthDate("2005122"), null);
  assert.equal(splitPastedBirthDate("200512230"), null);
  assert.equal(splitPastedBirthDate("날짜 없음"), null);
  assert.equal(splitPastedBirthDate(""), null);
});
