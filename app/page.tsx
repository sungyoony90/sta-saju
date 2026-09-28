import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">오늘의 운세 · 맞춤 사주</p>
        <h1>오늘의 흐름을,<br />내 사주에 맞게.</h1>
        <p className="intro">
          생년월일과 출생시간으로 사주를 계산하고, 한국 시간의 오늘 일진과
          함께 살펴보세요. 기존 커리어 상담도 이어서 사용할 수 있습니다.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
