"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  calculate,
  InputError,
  type SajuChart,
  type SajuInput,
} from "../lib/saju/chart";
import {
  ReadingInputError,
  validateCareerContext,
  type CareerContext,
  type ReadingCard,
} from "../lib/saju/sample-reading";
import type {
  GeminiFollowUp,
  GeminiReading,
} from "../lib/saju/gemini-contract";
import {
  buildSavedReadingInsert,
  parseSavedReading,
  type SavedReading,
} from "../lib/saju/saved-reading";
import { getSupabaseClient } from "../lib/supabase/client";

type Conversation = { question: string; answer: string };
type ReadingMeta = Pick<GeminiReading, "conclusion" | "realityChecks" | "disclaimer">;

const emptyContext: CareerContext = {
  employment: "",
  concern: "",
  timing: "",
  situation: "",
  question: "",
};

export default function SajuForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [savedReadings, setSavedReadings] = useState<SavedReading[]>([]);
  const [savedMessage, setSavedMessage] = useState("");
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [isRestoredReading, setIsRestoredReading] = useState(false);
  const [chart, setChart] = useState<SajuChart | null>(null);
  const [error, setError] = useState("");
  const [context, setContext] = useState<CareerContext>(emptyContext);
  const [reading, setReading] = useState<ReadingCard[]>([]);
  const [readingError, setReadingError] = useState("");
  const [readingMeta, setReadingMeta] = useState<ReadingMeta | null>(null);
  const [modelName, setModelName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [conversation, setConversation] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(error ? null : data.user);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (_event === "SIGNED_OUT") {
        setSavedReadings([]);
        setSavedMessage("");
        setChart(null);
        setReading([]);
        setReadingMeta(null);
        setConversation([]);
        setContext(emptyContext);
        setFollowUp("");
        setActiveSavedId(null);
        setIsRestoredReading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadSavedReadings = useCallback(async () => {
    if (!supabase || !user) {
      setSavedReadings([]);
      return;
    }
    const { data, error: fetchError } = await supabase
      .from("saju_readings")
      .select("id, created_at, chart, reading, model")
      .order("created_at", { ascending: false })
      .limit(10);
    if (fetchError) {
      setSavedMessage("저장된 결과를 불러오지 못했습니다.");
      return;
    }
    const valid: SavedReading[] = [];
    for (const row of data ?? []) {
      try {
        valid.push(parseSavedReading(row));
      } catch {
        // 예상하지 못한 저장 데이터는 화면에 사용하지 않습니다.
      }
    }
    setSavedReadings(valid);
  }, [supabase, user]);

  useEffect(() => {
    void loadSavedReadings();
  }, [loadSavedReadings]);

  async function handleGoogleLogin() {
    if (!supabase) return;
    setAuthError("");
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (loginError) setAuthError("Google 로그인 화면을 열지 못했습니다. 다시 시도해주세요.");
  }

  async function handleSignOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setAuthError("로그아웃하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    window.location.replace("/");
  }

  function showSavedReading(item: SavedReading) {
    setChart(item.chart);
    setReading(item.reading.cards.map((card) => ({
      title: card.title,
      summary: card.summary,
      detail: card.evidence,
      action: card.action,
    })));
    setReadingMeta({
      conclusion: item.reading.conclusion,
      realityChecks: item.reading.realityChecks,
      disclaimer: item.reading.disclaimer,
    });
    setModelName(item.model);
    setContext(emptyContext);
    setConversation([]);
    setFollowUp("");
    setReadingError("");
    setSavedMessage("저장된 해석을 열었습니다.");
    setActiveSavedId(item.id);
    setIsRestoredReading(true);
  }

  async function handleDeleteSavedReading(id: string) {
    if (!supabase || !user) return;
    if (!window.confirm("이 저장된 사주 해석을 삭제할까요?")) return;
    const { error: deleteError } = await supabase
      .from("saju_readings")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setSavedMessage("결과를 삭제하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    setSavedReadings((current) => current.filter((item) => item.id !== id));
    if (activeSavedId === id) {
      setChart(null);
      setReading([]);
      setReadingMeta(null);
      setActiveSavedId(null);
      setIsRestoredReading(false);
    }
    setSavedMessage("저장된 결과를 삭제했습니다.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: SajuInput = {
      date: String(data.get("date") || ""),
      time: String(data.get("time") || ""),
      calendar: "solar",
      topic: "general",
      question: "",
    };

    try {
      setChart(calculate(input));
      setError("");
      setContext(emptyContext);
      setReading([]);
      setReadingMeta(null);
      setModelName("");
      setReadingError("");
      setConversation([]);
      setFollowUp("");
      setSavedMessage("");
      setActiveSavedId(null);
      setIsRestoredReading(false);
    } catch (caught) {
      setChart(null);
      setError(
        caught instanceof InputError
          ? caught.message
          : "계산하지 못했습니다. 입력을 확인해주세요.",
      );
    }
  }

  function updateContext(field: keyof CareerContext, value: string) {
    setContext((current) => ({ ...current, [field]: value }));
  }

  async function responseError(response: Response) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error || "Gemini 해석을 만들지 못했습니다.";
    } catch {
      return "Gemini 해석을 만들지 못했습니다.";
    }
  }

  async function handleReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chart) return;
    try {
      validateCareerContext(context);
      setIsReading(true);
      setReadingError("");
      const response = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "reading", chart, context }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as {
        model: string;
        reading: GeminiReading;
      };
      setReading(
        payload.reading.cards.map((card) => ({
          title: card.title,
          summary: card.summary,
          detail: card.evidence,
          action: card.action,
        })),
      );
      setReadingMeta({
        conclusion: payload.reading.conclusion,
        realityChecks: payload.reading.realityChecks,
        disclaimer: payload.reading.disclaimer,
      });
      setModelName(payload.model);
      setReadingError("");
      setConversation([]);
      setFollowUp("");
      setActiveSavedId(null);
      setIsRestoredReading(false);

      if (supabase && user) {
        try {
          const insert = buildSavedReadingInsert(
            chart,
            payload.reading,
            payload.model,
          );
          const { data: saved, error: saveError } = await supabase
            .from("saju_readings")
            .insert(insert)
            .select("id, created_at, chart, reading, model")
            .single();
          if (saveError || !saved) throw new Error("save_failed");
          const item = parseSavedReading(saved);
          setSavedReadings((current) => [item, ...current].slice(0, 10));
          setActiveSavedId(item.id);
          setSavedMessage("해석 결과를 계정에 저장했습니다.");
        } catch {
          setSavedMessage("해석은 나왔지만 계정에 저장하지 못했습니다.");
        }
      } else {
        setSavedMessage("Google로 로그인하면 다음 해석부터 계정에 저장됩니다.");
      }
    } catch (caught) {
      setReading([]);
      setReadingMeta(null);
      setModelName("");
      setReadingError(
        caught instanceof ReadingInputError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "맞춤 풀이를 만들지 못했습니다. 입력을 확인해주세요.",
      );
    } finally {
      setIsReading(false);
    }
  }

  async function handleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chart || isRestoredReading || conversation.length >= 3) return;
    try {
      const question = followUp.trim();
      if (!question) throw new ReadingInputError("추가 질문을 입력해주세요.");
      setIsFollowingUp(true);
      setReadingError("");
      const response = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "followup",
          chart,
          context,
          conversation,
          question,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as {
        model: string;
        followUp: GeminiFollowUp;
      };
      const answer = `${payload.followUp.answer}\n\n현실에서 확인할 점: ${payload.followUp.realityChecks.join(" · ")}\n\n${payload.followUp.disclaimer}`;
      setConversation((current) => [
        ...current,
        { question, answer },
      ]);
      setModelName(payload.model);
      setFollowUp("");
      setReadingError("");
    } catch (caught) {
      setReadingError(
        caught instanceof ReadingInputError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "답변을 만들지 못했습니다. 질문을 확인해주세요.",
      );
    } finally {
      setIsFollowingUp(false);
    }
  }

  return (
    <section className="input-card" aria-labelledby="input-title">
      <section className="auth-panel" aria-label="Google 로그인과 저장 결과">
        <div>
          <p className="result-label">내 상담 보관함</p>
          {authLoading ? (
            <p className="note">로그인 상태를 확인하고 있습니다…</p>
          ) : user ? (
            <p className="note">{user.email ?? "Google 사용자"} 계정으로 로그인했습니다.</p>
          ) : (
            <p className="note">Google로 로그인하면 새 해석 결과를 계정에 저장할 수 있습니다.</p>
          )}
        </div>
        {!authLoading && supabase && (
          user ? (
            <button type="button" className="secondary-button" onClick={handleSignOut}>로그아웃</button>
          ) : (
            <button type="button" onClick={handleGoogleLogin}>Google로 로그인</button>
          )
        )}
        {!supabase && <p className="error">Supabase 연결 설정이 필요합니다.</p>}
        {authError && <p className="error">{authError}</p>}
      </section>

      {user && (
        <section className="saved-readings" aria-labelledby="saved-readings-title">
          <h2 id="saved-readings-title">저장된 해석</h2>
          <p className="note">최근 10개를 보여줍니다. 출생 정보 원문과 고민·질문은 저장하지 않습니다.</p>
          {savedReadings.length === 0 ? (
            <p className="note">아직 저장된 해석이 없습니다.</p>
          ) : (
            <ul>
              {savedReadings.map((item) => (
                <li key={item.id}>
                  <button type="button" className="saved-reading-open" onClick={() => showSavedReading(item)}>
                    <span>{item.reading.conclusion}</span>
                    <small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small>
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void handleDeleteSavedReading(item.id)}>삭제</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {savedMessage && <p className="save-message" role="status">{savedMessage}</p>}
      <h2 id="input-title">언제 태어나셨나요?</h2>
      <p className="form-intro">양력 생년월일과 태어난 시간을 입력해주세요.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="date">생년월일</label>
        <input id="date" name="date" type="date" required />

        <label htmlFor="time">출생시간</label>
        <input id="time" name="time" type="time" required />

        <button type="submit">내 사주 알아보기</button>
      </form>

      <div className="feedback" aria-live="polite">
        {error && <p className="error">{error}</p>}
        {chart && (
          <section className="result" aria-labelledby="result-title">
            <p className="result-label">계산 결과</p>
            <h2 id="result-title" className="day-pillar">
              {chart.pillars[2].korean}일주
            </h2>
            <p className="day-master">
              일간은 {chart.dayMaster.korean}
              {chart.dayMaster.element}({chart.dayMaster.character})입니다.
            </p>
            <dl className="pillars">
              {chart.pillars.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
            <p className="note">{chart.method}</p>
          </section>
        )}
      </div>

      {chart && (
        <section className="consultation" aria-labelledby="consultation-title">
          <p className="prototype-label">Gemini 맞춤 사주 해석</p>
          <h2 id="consultation-title">지금 어떤 변화를 고민하고 있나요?</h2>
          <p className="form-intro">
            선택한 상황과 직접 적은 고민을 계산된 사주 결과에 연결해 Gemini가
            해석합니다. 생년월일과 출생시간 원문은 Gemini에 보내지 않습니다.
          </p>

          <form onSubmit={handleReading} className="context-form">
            <label htmlFor="employment">현재 상태</label>
            <select
              id="employment"
              value={context.employment}
              onChange={(event) => updateContext("employment", event.target.value)}
              required
            >
              <option value="">선택해주세요</option>
              <option>재직 중</option>
              <option>이직 준비 중</option>
              <option>구직 중</option>
              <option>휴식 중</option>
            </select>

            <label htmlFor="concern">가장 큰 고민</label>
            <select
              id="concern"
              value={context.concern}
              onChange={(event) => updateContext("concern", event.target.value)}
              required
            >
              <option value="">선택해주세요</option>
              <option>직업 방향</option>
              <option>이직 시도</option>
              <option>성장 가능성</option>
              <option>소득과 돈 관리</option>
            </select>

            <label htmlFor="timing">원하는 변화 시점</label>
            <select
              id="timing"
              value={context.timing}
              onChange={(event) => updateContext("timing", event.target.value)}
              required
            >
              <option value="">선택해주세요</option>
              <option>바로</option>
              <option>3개월 안</option>
              <option>1년 안</option>
              <option>아직 미정</option>
            </select>

            <label htmlFor="situation">현재 상황</label>
            <textarea
              id="situation"
              value={context.situation}
              onChange={(event) => updateContext("situation", event.target.value)}
              placeholder="예: 현재 업무에서 성장하고 있다는 느낌이 적고, 새로운 분야로 옮길지 고민 중이에요."
              maxLength={500}
              required
            />

            <label htmlFor="question">가장 궁금한 질문</label>
            <textarea
              id="question"
              value={context.question}
              onChange={(event) => updateContext("question", event.target.value)}
              placeholder="예: 지금 이직 준비를 시작하는 게 좋을까요?"
              maxLength={200}
              required
            />

            <button type="submit" disabled={isReading}>
              {isReading ? "Gemini가 해석하고 있어요…" : "Gemini 맞춤 풀이 보기"}
            </button>
          </form>

          {readingError && <p className="error">{readingError}</p>}

          {reading.length > 0 && (
            <section className="reading" aria-labelledby="reading-title">
              <div className="reading-heading">
                <div>
                  <p className="result-label">현재 상황을 반영한 Gemini 해석</p>
                  <h2 id="reading-title">맞춤 풀이</h2>
                </div>
                <span className="sample-badge">{modelName || "GEMINI"}</span>
              </div>

              {readingMeta && (
                <div className="reading-summary">
                  <strong>{readingMeta.conclusion}</strong>
                  <ul>
                    {readingMeta.realityChecks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="reading-grid">
                {reading.map((card) => (
                  <article className="reading-card" key={card.title}>
                    <h3>{card.title}</h3>
                    <p>{card.summary}</p>
                    <p className="action">{card.action}</p>
                    <details>
                      <summary>자세히 보기</summary>
                      <p>{card.detail}</p>
                    </details>
                  </article>
                ))}
              </div>

              <section className="follow-up" aria-labelledby="follow-up-title">
                <h3 id="follow-up-title">더 궁금한 점이 있나요?</h3>
                <p className="note">
                  최대 3회까지 질문할 수 있습니다. 현재 {conversation.length}/3회
                </p>

                {conversation.map((item, index) => (
                  <div className="message-pair" key={`${item.question}-${index}`}>
                    <p className="user-message">나: {item.question}</p>
                    <p className="assistant-message">Gemini 상담: {item.answer}</p>
                  </div>
                ))}

                {isRestoredReading ? (
                  <p className="note">저장된 해석은 질문 원문을 보관하지 않아 이어서 상담할 수 없습니다. 새 상담을 시작해주세요.</p>
                ) : conversation.length < 3 ? (
                  <form onSubmit={handleFollowUp} className="follow-up-form">
                    <label htmlFor="follow-up">추가 질문</label>
                    <textarea
                      id="follow-up"
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      placeholder="예: 두 선택지 중 무엇을 먼저 비교하면 좋을까요?"
                      maxLength={200}
                      required
                    />
                    <button type="submit" disabled={isFollowingUp}>
                      {isFollowingUp ? "답변을 만들고 있어요…" : "질문 보내기"}
                    </button>
                  </form>
                ) : (
                  <p className="limit-message">
                    추가 질문 3회를 모두 사용했습니다.
                  </p>
                )}
                {readingMeta && <p className="note">{readingMeta.disclaimer}</p>}
              </section>
            </section>
          )}
        </section>
      )}
    </section>
  );
}
