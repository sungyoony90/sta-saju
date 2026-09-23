import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculate } from "../lib/saju/chart";
import { buildSavedReadingInsert, parseSavedReading } from "../lib/saju/saved-reading";
import type { GeminiReading } from "../lib/saju/gemini-contract";

const reading: GeminiReading = {
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

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "career",
  question: "",
});

const row = {
  id: "f27b3f6a-a56c-4f2f-8a57-684c824117bd",
  created_at: "2026-09-23T12:34:56.000Z",
  chart,
  reading,
  model: "gemini-3.5-flash-lite",
};

test("저장 payload는 출생 원문과 질문·상황 원문 및 임의 개인정보를 제외한다", () => {
  const insert = buildSavedReadingInsert(
    {
      ...chart,
      date: "2005-12-23",
      time: "08:37",
      question: "비공개 사용자 질문 원문",
      email: "private@example.com",
    } as typeof chart,
    reading,
    "gemini-3.5-flash-lite",
  );
  const serialized = JSON.stringify(insert);

  assert.deepEqual(Object.keys(insert).sort(), ["chart", "model", "reading"]);
  assert.doesNotMatch(serialized, /2005-12-23|08:37|비공개 사용자 질문 원문|private@example\.com/);
  assert.doesNotMatch(serialized, /"(date|time|birthDate|birthTime|question|situation|email|user_id)"/);
  assert.deepEqual(insert.reading, reading);
});

test("저장 기록은 유효한 계산 결과와 세 가지 해석 카드를 복원한다", () => {
  const parsed = parseSavedReading(row);
  assert.equal(parsed.id, row.id);
  assert.deepEqual(parsed.chart, chart);
  assert.deepEqual(parsed.reading, reading);
});

test("저장 기록의 JSON이 깨지거나 필수 카드가 빠지면 거절한다", () => {
  assert.throws(() => parseSavedReading({ ...row, chart: "{bad json" }));
  assert.throws(() => parseSavedReading({ ...row, reading: "{bad json" }));
  assert.throws(() => parseSavedReading({ ...row, reading: { ...reading, cards: reading.cards.slice(0, 2) } }));
  assert.throws(() => parseSavedReading({ ...row, reading: { ...reading, cards: [reading.cards[0], reading.cards[0], reading.cards[2]] } }));
});

test("로그인은 Supabase의 Google OAuth 제공자를 사용한다", () => {
  const source = readFileSync(new URL("../app/saju-form.tsx", import.meta.url), "utf8");
  assert.match(source, /signInWithOAuth\s*\(\s*\{\s*provider:\s*["']google["']/);
  assert.match(source, /signOut\s*\(/);
});

test("데이터베이스는 익명 접근을 차단하고 본인 행만 조회·삽입·삭제하게 한다", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260923000000_create_saju_readings.sql", import.meta.url),
    "utf8",
  ).toLowerCase();

  assert.match(sql, /alter table public\.saju_readings enable row level security\s*;/);
  assert.match(sql, /revoke all on public\.saju_readings from anon, authenticated\s*;/);
  assert.match(sql, /grant select, insert, delete on public\.saju_readings to authenticated\s*;/);
  assert.doesNotMatch(sql, /grant\s+[^;]*\s+to\s+anon\s*;/);
  for (const operation of ["select", "insert", "delete"]) {
    const policy = new RegExp(`create policy [^;]+?on public\\.saju_readings for ${operation} to authenticated\\s+(?:using|with check)\\s*\\(\\(select auth\\.uid\\(\\)\\) = user_id\\)\\s*;`, "s");
    assert.match(sql, policy);
  }
  assert.doesNotMatch(sql, /for update\b/);
});
