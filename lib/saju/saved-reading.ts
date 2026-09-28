import type { SajuChart } from "./chart";
import {
  GeminiContractError,
  parseGeminiReading,
  sanitizeChart,
  type GeminiReading,
} from "./gemini-contract";
import { parseYearlyReading, type YearlyReading } from "./yearly-reading";

export type StoredReading = GeminiReading | YearlyReading;

export type SavedReading = {
  id: string;
  createdAt: string;
  chart: SajuChart;
  reading: StoredReading;
  model: string;
  kind: "career" | "yearly";
  targetYear?: number;
};

export function buildSavedReadingInsert(
  chart: SajuChart,
  reading: StoredReading,
  model: string,
) {
  const safeModel = model.trim();
  if (!safeModel || safeModel.length > 100)
    throw new GeminiContractError("모델 정보를 확인해주세요.");

  return {
    chart: sanitizeChart(chart),
    reading:
      "kind" in reading && reading.kind === "yearly"
        ? parseYearlyReading(reading)
        : parseGeminiReading(reading),
    model: safeModel,
  };
}

export function parseSavedReading(value: unknown): SavedReading {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new GeminiContractError("저장된 결과 형식이 올바르지 않습니다.");

  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id))
    throw new GeminiContractError("저장된 결과 ID가 올바르지 않습니다.");
  if (
    typeof row.created_at !== "string" ||
    Number.isNaN(Date.parse(row.created_at))
  )
    throw new GeminiContractError("저장 시각이 올바르지 않습니다.");
  if (typeof row.model !== "string" || !row.model.trim())
    throw new GeminiContractError("저장된 모델 정보가 없습니다.");

  const reading =
    typeof row.reading === "object" &&
    row.reading !== null &&
    "kind" in row.reading &&
    row.reading.kind === "yearly"
      ? parseYearlyReading(row.reading)
      : parseGeminiReading(row.reading);

  return {
    id: row.id,
    createdAt: row.created_at,
    chart: sanitizeChart(row.chart),
    reading,
    model: row.model.trim(),
    kind: "kind" in reading && reading.kind === "yearly" ? "yearly" : "career",
    targetYear:
      "kind" in reading && reading.kind === "yearly"
        ? reading.targetYear
        : undefined,
  };
}
