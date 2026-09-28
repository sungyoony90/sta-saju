import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">내 사주와 앞으로의 흐름</p>
        <h1>내 사주의 바탕과<br />다가올 한 해를 살펴보세요.</h1>
        <p className="intro">
          계산된 사주를 바탕으로 현재 고민을 정리하거나, 올해부터 5년 뒤까지
          선택한 한 해의 관계·일·돈 흐름을 살펴보세요.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
