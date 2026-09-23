import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">맞춤 사주 커리어 상담 · Prototype</p>
        <h1>뻔한 풀이 말고,<br />지금 내 상황에 맞게.</h1>
        <p className="intro">
          사주 계산 결과와 현재 고민을 함께 살펴보고, 직업과 돈에 관한
          다음 선택을 구체적으로 정리해보세요.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
