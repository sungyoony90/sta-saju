import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">내 사주 전체 · 앞으로의 흐름</p>
        <h1>내 사주의 바탕부터<br />앞으로의 흐름까지.</h1>
        <p className="intro">
          같은 출생 정보로 평생의 반복 경향과 올해부터 5년 뒤까지의 흐름을
          나누어 보고, 해석에 쓰인 계산 근거도 직접 확인하세요.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
