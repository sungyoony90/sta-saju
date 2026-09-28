import type { SajuChart } from "./chart";
import {
  GeminiContractError,
  parseGeminiReading,
  sanitizeChart,
  type GeminiReading,
} from "./gemini-contract";
import { parseWholeReading, type WholeReading } from "./whole-reading";
import type { YearFlow } from "./year-flow";

export type StoredReading = GeminiReading | WholeReading;

export type SavedReading = {
  id: string;
  createdAt: string;
  chart: SajuChart;
  reading: StoredReading;
  model: string;
};

export function buildSavedReadingInsert(
  chart: SajuChart,
  reading: StoredReading,
  model: string,
  yearFlow?: YearFlow,
) {
  const safeModel = model.trim();
  if (!safeModel || safeModel.length > 100)
    throw new GeminiContractError("모델 정보를 확인해주세요.");

  return {
    chart: sanitizeChart(chart),
    reading: reading.version === 2
      ? parseWholeReading(reading, sanitizeChart(chart), reading.kind, yearFlow)
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

  return {
    id: row.id,
    createdAt: row.created_at,
    chart: sanitizeChart(row.chart),
    reading: (() => {
      const rawReading = row.reading as { version?: unknown; kind?: unknown; targetYear?: unknown };
      if (rawReading?.version !== 2) return parseGeminiReading(row.reading);
      const kind = rawReading.kind === "yearly" ? "yearly" : "lifetime";
      const yearFlow = kind === "yearly" && typeof rawReading.targetYear === "number"
        ? {
            targetYear: rawReading.targetYear,
            pillar: (() => {
              const ref = (rawReading as WholeReading).sections.flatMap((section) => section.evidenceRefs).find((item) => item.startsWith("연주:"));
              return ref?.slice(3) || "";
            })(),
            korean: "",
            boundary: "입춘" as const,
          }
        : undefined;
      return parseWholeReading(row.reading, sanitizeChart(row.chart), kind, yearFlow);
    })(),
    model: row.model.trim(),
  };
}
