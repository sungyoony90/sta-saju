"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { calculate, InputError, type SajuChart, type SajuInput } from "../lib/saju/chart";
import { buildSavedReadingInsert, parseSavedReading, type SavedReading, type StoredReading } from "../lib/saju/saved-reading";
import type { ReadingKind, WholeReading } from "../lib/saju/whole-reading";
import { calculateYearFlow, getKoreanCurrentYear } from "../lib/saju/year-flow";
import { getSupabaseClient } from "../lib/supabase/client";

type DisplayCard = {
  id: string;
  title: string;
  summary: string;
  evidence: string;
  realityCheck: string;
  action: string;
};

const glossary = [
  ["년주", "태어난 해의 기둥으로, 바깥 환경과 초기 배경을 살펴보는 기준입니다."],
  ["월주", "태어난 달의 기둥으로, 계절과 사회적 환경을 살펴보는 기준입니다."],
  ["일주", "태어난 날의 기둥으로, 나 자신과 가까운 관계를 살펴보는 기준입니다."],
  ["시주", "태어난 시각의 기둥으로, 내면과 이후의 관심을 살펴보는 기준입니다."],
  ["일간", "일주의 첫 글자이며 풀이에서 ‘나’를 나타내는 중심 기준입니다."],
  ["오행", "목·화·토·금·수 다섯 분류입니다. 여기서는 여덟 글자의 대표 개수만 셉니다."],
] as const;

function readingHeadline(reading: StoredReading) {
  return reading.version === 2 ? reading.headline : reading.conclusion;
}

function readingLabel(reading: StoredReading) {
  if (reading.version === 1) return "기존 취업 풀이";
  return reading.kind === "lifetime" ? "내 사주 전체" : `${reading.targetYear}년 흐름`;
}

function readingCards(reading: StoredReading): DisplayCard[] {
  if (reading.version === 2) {
    return reading.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      evidence: section.evidence,
      realityCheck: section.realityCheck,
      action: section.action,
    }));
  }
  return reading.cards.map((card) => ({
    id: card.id,
    title: card.title,
    summary: card.summary,
    evidence: card.evidence,
    realityCheck: "현재 상황에서도 이 경향이 반복되는지 직접 확인해보세요.",
    action: card.action,
  }));
}

export default function SajuForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const currentYear = useMemo(() => getKoreanCurrentYear(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [savedReadings, setSavedReadings] = useState<SavedReading[]>([]);
  const [savedMessage, setSavedMessage] = useState("");
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [chart, setChart] = useState<SajuChart | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState<StoredReading | null>(null);
  const [readingError, setReadingError] = useState("");
  const [modelName, setModelName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [mode, setMode] = useState<ReadingKind>("lifetime");
  const [targetYear, setTargetYear] = useState(currentYear);

  const resetPersonalResult = useCallback(() => {
    setChart(null);
    setReading(null);
    setModelName("");
    setActiveSavedId(null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data, error: getUserError }) => {
      if (!active) return;
      setUser(getUserError ? null : data.user);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (event === "SIGNED_OUT") {
        setSavedReadings([]);
        setSavedMessage("");
        resetPersonalResult();
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [resetPersonalResult, supabase]);

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
        // 깨진 저장 데이터는 건너뛰고 화면에 사용하지 않습니다.
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
    setReading(item.reading);
    if (item.reading.version === 2) {
      setMode(item.reading.kind);
      if (item.reading.targetYear) setTargetYear(item.reading.targetYear);
    }
    setModelName(item.model);
    setReadingError("");
    setSavedMessage("저장된 해석을 열었습니다.");
    setActiveSavedId(item.id);
  }

  async function handleDeleteSavedReading(id: string) {
    if (!supabase || !user) return;
    if (!window.confirm("이 저장된 사주 해석을 삭제할까요?")) return;
    const { error: deleteError } = await supabase.from("saju_readings").delete().eq("id", id);
    if (deleteError) {
      setSavedMessage("결과를 삭제하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    setSavedReadings((current) => current.filter((item) => item.id !== id));
    if (activeSavedId === id) resetPersonalResult();
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
      setReading(null);
      setModelName("");
      setReadingError("");
      setSavedMessage("");
      setActiveSavedId(null);
    } catch (caught) {
      resetPersonalResult();
      setError(caught instanceof InputError ? caught.message : "계산하지 못했습니다. 입력을 확인해주세요.");
    }
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
      setIsReading(true);
      setReadingError("");
      setReading(null);
      const yearFlow = mode === "yearly" ? calculateYearFlow(targetYear, currentYear) : undefined;
      const response = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, chart, ...(yearFlow ? { targetYear: yearFlow.targetYear } : {}) }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { model: string; reading: WholeReading };
      setReading(payload.reading);
      setModelName(payload.model);
      setActiveSavedId(null);

      if (supabase && user) {
        try {
          const insert = buildSavedReadingInsert(chart, payload.reading, payload.model, yearFlow);
          const { data: saved, error: saveError } = await supabase
            .from("saju_readings")
            .insert(insert)
            .select("id, created_at, chart, reading, model")
            .single();
          if (saveError || !saved) throw new Error("save_failed");
          const item = parseSavedReading(saved);
          setSavedReadings((current) => [item, ...current].slice(0, 10));
          setActiveSavedId(item.id);
          setSavedMessage(`${readingLabel(payload.reading)} 풀이를 계정에 저장했습니다.`);
        } catch {
          setSavedMessage("풀이는 나왔지만 계정에 저장하지 못했습니다.");
        }
      } else {
        setSavedMessage("Google로 로그인하면 다음 풀이부터 계정에 저장됩니다.");
      }
    } catch (caught) {
      setReading(null);
      setModelName("");
      setReadingError(caught instanceof Error ? caught.message : "풀이를 만들지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsReading(false);
    }
  }

  const cards = reading ? readingCards(reading) : [];

  return (
    <section className="input-card" aria-labelledby="input-title">
      <section className="auth-panel" aria-label="Google 로그인과 저장 결과">
        <div>
          <p className="result-label">내 풀이 보관함</p>
          {authLoading ? <p className="note">로그인 상태를 확인하고 있습니다…</p> : user ? (
            <p className="note">{user.email ?? "Google 사용자"} 계정으로 로그인했습니다.</p>
          ) : <p className="note">Google로 로그인하면 새 풀이 결과를 계정에 저장할 수 있습니다.</p>}
        </div>
        {!authLoading && supabase && (user ? (
          <button type="button" className="secondary-button" onClick={handleSignOut}>로그아웃</button>
        ) : <button type="button" onClick={handleGoogleLogin}>Google로 로그인</button>)}
        {!supabase && <p className="error">Supabase 연결 설정이 필요합니다.</p>}
        {authError && <p className="error">{authError}</p>}
      </section>

      {user && (
        <section className="saved-readings" aria-labelledby="saved-readings-title">
          <h2 id="saved-readings-title">저장된 풀이</h2>
          <p className="note">최근 10개를 보여줍니다. 출생일과 출생시간 원문은 저장하지 않습니다.</p>
          {savedReadings.length === 0 ? <p className="note">아직 저장된 풀이가 없습니다.</p> : (
            <ul>{savedReadings.map((item) => (
              <li key={item.id}>
                <button type="button" className="saved-reading-open" onClick={() => showSavedReading(item)}>
                  <span><b>{readingLabel(item.reading)}</b> · {readingHeadline(item.reading)}</span>
                  <small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small>
                </button>
                <button type="button" className="secondary-button" onClick={() => void handleDeleteSavedReading(item.id)}>삭제</button>
              </li>
            ))}</ul>
          )}
        </section>
      )}

      {savedMessage && <p className="save-message" role="status">{savedMessage}</p>}
      <h2 id="input-title">언제 태어나셨나요?</h2>
      <p className="form-intro">양력 생년월일과 정확한 출생시간만 입력하면 삶 전반의 반복 경향을 살펴볼 수 있습니다.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="date">생년월일</label>
        <input id="date" name="date" type="date" required />
        <label htmlFor="time">출생시간</label>
        <input id="time" name="time" type="time" required />
        <button type="submit">사주 원국 계산하기</button>
      </form>

      <div className="feedback" aria-live="polite">
        {error && <p className="error">{error}</p>}
        {chart && (
          <section className="result" aria-labelledby="result-title">
            <p className="result-label">계산 결과</p>
            <h2 id="result-title" className="day-pillar">{chart.pillars[2].korean}일주</h2>
            <p className="day-master">일간은 {chart.dayMaster.korean}{chart.dayMaster.element}({chart.dayMaster.character})입니다.</p>
            <dl className="pillars">{chart.pillars.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.text}</dd></div>
            ))}</dl>
            <h3 className="subheading">대표 오행 8자</h3>
            <div className="elements" aria-label="오행 대표 개수">{Object.entries(chart.elements).map(([name, count]) => (
              <div key={name}><span>{name}</span><strong>{count}</strong><span className="element-dots" aria-hidden="true">{"●".repeat(count) || "–"}</span></div>
            ))}</div>
            <p className="note">합계 {Object.values(chart.elements).reduce((sum, count) => sum + count, 0)}자. {chart.elementMethod}</p>
            <details className="glossary">
              <summary>용어를 쉽게 설명해 주세요</summary>
              <dl>{glossary.map(([term, explanation]) => <div key={term}><dt>{term}</dt><dd>{explanation}</dd></div>)}</dl>
            </details>
            <p className="note">{chart.method}</p>
          </section>
        )}
      </div>

      {chart && (
        <section className="consultation" aria-labelledby="consultation-title">
          <p className="prototype-label">삶의 바탕과 앞으로의 흐름</p>
          <h2 id="consultation-title">무엇을 살펴볼까요?</h2>
          <div className="reading-tabs" role="tablist" aria-label="풀이 종류">
            <button type="button" role="tab" aria-selected={mode === "lifetime"} onClick={() => { setMode("lifetime"); setReading(null); }}>내 사주 전체</button>
            <button type="button" role="tab" aria-selected={mode === "yearly"} onClick={() => { setMode("yearly"); setReading(null); }}>앞으로의 흐름</button>
          </div>
          {mode === "lifetime" ? (
            <p className="form-intro">성향, 강점과 주의점, 관계, 일, 돈에서 반복되기 쉬운 경향을 봅니다. 출생 정보 원문은 Gemini에 보내지 않습니다.</p>
          ) : (
            <div className="year-picker">
              <label htmlFor="target-year">살펴볼 연도</label>
              <select id="target-year" value={targetYear} onChange={(event) => { setTargetYear(Number(event.target.value)); setReading(null); }}>
                {Array.from({ length: 6 }, (_, index) => currentYear + index).map((year) => <option key={year} value={year}>{year}년{year === currentYear ? " · 오늘 이후" : ""}</option>)}
              </select>
              <p className="note">{targetYear}년 {calculateYearFlow(targetYear, currentYear).korean}({calculateYearFlow(targetYear, currentYear).pillar})년 · 연도 경계는 입춘 기준</p>
            </div>
          )}
          <form onSubmit={handleReading}>
            <button type="submit" disabled={isReading}>{isReading ? "Gemini가 풀이를 만들고 있어요…" : mode === "lifetime" ? "내 사주 전체 풀이 보기" : `${targetYear}년 흐름 보기`}</button>
          </form>
          {readingError && <p className="error" role="alert">{readingError}</p>}
        </section>
      )}

      {reading && (
        <section className="reading" aria-labelledby="reading-title">
          <div className="reading-heading">
            <div>
              <p className="result-label">{readingLabel(reading)}</p>
              <h2 id="reading-title">{readingHeadline(reading)}</h2>
            </div>
            <span className="sample-badge">{modelName || "GEMINI"}</span>
          </div>
          {reading.version === 2 && reading.kind === "yearly" && reading.targetYear === currentYear && (
            <p className="today-forward">올해 풀이는 오늘 이후의 큰 흐름만 다루며 특정 날짜의 사건을 예측하지 않습니다.</p>
          )}
          <div className="reading-grid">{cards.map((card) => (
            <article className="reading-card" key={card.id}>
              <h3>{card.title}</h3>
              <p>{card.summary}</p>
              <p className="reality-check"><strong>현실에서 확인할 질문</strong><br />{card.realityCheck}</p>
              <p className="action"><strong>다음 행동</strong><br />{card.action}</p>
              <details>
                <summary>왜 이렇게 읽었나요?</summary>
                <p>{card.evidence}</p>
                {reading.version === 2 && (
                  <p className="evidence-refs">계산 근거: {reading.sections.find((section) => section.id === card.id)?.evidenceRefs.join(" · ")}</p>
                )}
              </details>
            </article>
          ))}</div>
          <p className="note">{reading.disclaimer}</p>
          {activeSavedId && <p className="note">저장된 풀이를 보고 있습니다.</p>}
        </section>
      )}
    </section>
  );
}
