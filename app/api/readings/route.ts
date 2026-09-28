import { NextResponse } from "next/server";
import {
  buildFollowUpPrompt,
  buildReadingPrompt,
  followUpResponseSchema,
  GEMINI_MODEL,
  GeminiContractError,
  parseGeminiFollowUp,
  parseGeminiReading,
  readingResponseSchema,
  sanitizeChart,
  sanitizeContext,
  sanitizeConversation,
} from "../../../lib/saju/gemini-contract";
import {
  calculateYearFlow,
  getKoreanCurrentYear,
  getKoreanDate,
  YearFlowError,
} from "../../../lib/saju/year-flow";
import {
  buildYearlyReadingPrompt,
  parseYearlyReading,
  yearlyReadingResponseSchema,
} from "../../../lib/saju/yearly-reading";

export const runtime = "nodejs";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

async function callGemini(prompt: string, schema: Record<string, unknown>) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey)
    return {
      error: NextResponse.json(
        { code: "missing_key", error: "Gemini 연결 설정이 필요합니다." },
        { status: 503 },
      ),
    };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 2500,
            responseFormat: {
              text: { mimeType: "APPLICATION_JSON", schema },
            },
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const code = response.status === 429 ? "rate_limit" : "gemini_error";
      const message =
        response.status === 429
          ? "요청이 많아 잠시 후 다시 시도해주세요."
          : "Gemini 해석을 만들지 못했습니다. 다시 시도해주세요.";
      return { error: NextResponse.json({ code, error: message }, { status: 502 }) };
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text)
      throw new GeminiContractError("Gemini 응답에 해석 내용이 없습니다.");
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof GeminiContractError || error instanceof SyntaxError)
      return {
        error: NextResponse.json(
          { code: "invalid_response", error: "해석 결과를 확인하지 못했습니다. 다시 요청해주세요." },
          { status: 502 },
        ),
      };
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Gemini 응답 시간이 길어졌습니다. 다시 시도해주세요."
        : "Gemini에 연결하지 못했습니다. 다시 시도해주세요.";
    return {
      error: NextResponse.json({ code: "network_error", error: message }, { status: 502 }),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const chart = sanitizeChart(raw.chart);

    if (raw.mode === "yearly") {
      const now = new Date();
      const currentYear = getKoreanCurrentYear(now);
      const date = getKoreanDate(now);
      const yearFlow = calculateYearFlow(raw.targetYear, currentYear);
      const today = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      const result = await callGemini(
        buildYearlyReadingPrompt(chart, yearFlow, currentYear, today),
        yearlyReadingResponseSchema,
      );
      if (result.error) return result.error;
      return NextResponse.json({
        model: GEMINI_MODEL,
        yearFlow,
        reading: parseYearlyReading(result.value, yearFlow),
      });
    }

    const context = sanitizeContext(raw.context);

    if (raw.mode === "followup") {
      const conversation = sanitizeConversation(raw.conversation);
      if (conversation.length >= 3)
        throw new GeminiContractError("추가 질문은 최대 3회까지 할 수 있습니다.");
      if (typeof raw.question !== "string" || !raw.question.trim())
        throw new GeminiContractError("추가 질문을 입력해주세요.");
      if (raw.question.trim().length > 200)
        throw new GeminiContractError("추가 질문은 200자까지 입력할 수 있습니다.");

      const result = await callGemini(
        buildFollowUpPrompt(chart, context, conversation, raw.question.trim()),
        followUpResponseSchema,
      );
      if (result.error) return result.error;
      return NextResponse.json({
        model: GEMINI_MODEL,
        followUp: parseGeminiFollowUp(result.value),
      });
    }

    const result = await callGemini(
      buildReadingPrompt(chart, context),
      readingResponseSchema,
    );
    if (result.error) return result.error;
    return NextResponse.json({
      model: GEMINI_MODEL,
      reading: parseGeminiReading(result.value),
    });
  } catch (error) {
    const message =
      error instanceof GeminiContractError || error instanceof YearFlowError
        ? error.message
        : "요청 내용을 확인해주세요.";
    return NextResponse.json({ code: "invalid_request", error: message }, { status: 400 });
  }
}
