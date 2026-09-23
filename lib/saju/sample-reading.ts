import type { SajuChart } from "./chart";

export type CareerContext = {
  employment: string;
  concern: string;
  timing: string;
  situation: string;
  question: string;
};

export type ReadingCard = {
  title: string;
  summary: string;
  detail: string;
  action: string;
};

const elementTone: Record<string, string> = {
  목: "성장 가능성과 다음 단계를 설계하는 힘",
  화: "생각을 밖으로 표현하고 움직임을 만드는 힘",
  토: "흐름을 정리하고 안정적으로 이어가는 힘",
  금: "기준을 세우고 핵심을 선별하는 힘",
  수: "상황을 관찰하고 유연하게 대응하는 힘",
};

export class ReadingInputError extends Error {}

export function validateCareerContext(context: CareerContext) {
  const fields = [
    [context.employment, "현재 상태를 선택해주세요."],
    [context.concern, "가장 큰 고민을 선택해주세요."],
    [context.timing, "원하는 변화 시점을 선택해주세요."],
    [context.situation, "현재 상황을 조금만 더 들려주세요."],
    [context.question, "가장 궁금한 질문을 적어주세요."],
  ] as const;

  for (const [value, message] of fields)
    if (!value.trim()) throw new ReadingInputError(message);

  if (context.situation.trim().length > 500)
    throw new ReadingInputError("현재 상황은 500자까지 입력할 수 있어요.");
  if (context.question.trim().length > 200)
    throw new ReadingInputError("질문은 200자까지 입력할 수 있어요.");
}

function strongestElements(chart: SajuChart) {
  return Object.entries(chart.elements)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([element]) => element)
    .join("·");
}

export function createSampleReading(
  chart: SajuChart,
  context: CareerContext,
): ReadingCard[] {
  validateCareerContext(context);
  const day = `${chart.dayMaster.korean}${chart.dayMaster.element}`;
  const strength = elementTone[chart.dayMaster.element];
  const strongest = strongestElements(chart);
  const moneyFocus = context.concern.includes("소득") || context.concern.includes("돈");

  return [
    {
      title: "직업·이직 방향",
      summary: `${context.employment}인 지금은 ${context.timing}에 맞춰 바로 결론을 내리기보다, ${strength}을 살릴 수 있는 선택지를 비교해보는 쪽을 추천합니다.`,
      detail: `일간은 ${day}이고 대표 오행 집계에서는 ${strongest}의 비중이 눈에 띕니다. 이 프로토타입은 이 계산값과 “${context.concern}”이라는 현재 고민을 연결해 방향을 제안합니다. 오행 집계는 지장간과 계절 가중치를 반영한 강약 판정이 아닙니다.`,
      action: `다음 행동: 관심 있는 역할 2개를 고르고, 각각에서 기대하는 성장·안정 조건을 한 줄씩 비교해보세요.`,
    },
    {
      title: "핵심 성향",
      summary: `${day}의 관점에서는 ${strength}을 중요한 자원으로 볼 수 있습니다. 현재 상황에서는 이 장점을 “무엇을 더 할까”보다 “어떤 기준으로 고를까”에 사용해보세요.`,
      detail: `사주 원국의 일주는 ${chart.pillars[2].korean}(${chart.pillars[2].text})입니다. 여기서는 일간과 대표 오행을 설명의 출발점으로만 사용하며, 성격이나 미래를 확정하지 않습니다. 사용자가 적은 상황인 “${context.situation.trim()}”도 함께 반영했습니다.`,
      action: `다음 행동: 최근 만족도가 높았던 일과 소모가 컸던 일을 하나씩 적고, 두 경험의 환경 차이를 찾아보세요.`,
    },
    {
      title: "가까운 시기의 준비 방향",
      summary: moneyFocus
        ? `${context.timing} 동안 수입 확대와 손실 방지를 따로 점검하는 준비가 필요합니다. 큰 결정보다 작은 실험으로 숫자를 확인하는 쪽을 추천합니다.`
        : `${context.timing} 동안 변화 가능성을 확인할 작은 실험을 먼저 해보세요. 실제 결과를 본 뒤 다음 결정을 좁히는 편이 안전합니다.`,
      detail: `이 카드는 아직 대운·세운을 계산한 예측이 아닙니다. 사용자가 선택한 변화 시점과 질문 “${context.question.trim()}”을 기준으로 만든 준비 계획입니다. 실제 시기 운세는 별도 계산과 검증이 마련된 뒤 추가해야 합니다.`,
      action: moneyFocus
        ? `다음 행동: 고정비, 비상자금, 목표 소득을 실제 숫자로 적고 감당할 수 있는 변화 범위를 정하세요.`
        : `다음 행동: 정보 탐색, 작은 지원 또는 현직자 대화 중 이번 주에 할 수 있는 하나를 고르세요.`,
    },
  ];
}

export function createSampleFollowUp(
  chart: SajuChart,
  context: CareerContext,
  question: string,
  turn: number,
) {
  const clean = question.trim();
  if (!clean) throw new ReadingInputError("추가 질문을 입력해주세요.");
  if (clean.length > 200)
    throw new ReadingInputError("추가 질문은 200자까지 입력할 수 있어요.");
  if (turn < 1 || turn > 3)
    throw new ReadingInputError("추가 질문은 최대 3회까지 할 수 있어요.");

  const risky = /전\s*재산|반드시|무조건|확실|대출|투자하면|수익/.test(clean);
  if (risky)
    return `수익이나 성공을 보장할 수는 없습니다. ${chart.dayMaster.korean}${chart.dayMaster.element}의 관점에서는 ${elementTone[chart.dayMaster.element]}을 활용해 선택 기준을 세워볼 수 있지만, 실제 결정 전에는 손실 가능성·비상자금·전문가 의견을 함께 확인하세요. 이번에는 전액 결정 대신 감당 가능한 작은 범위부터 검토하는 쪽을 추천합니다.`;

  return `“${clean}”에 대해서는, ${context.employment}인 현재와 ${context.timing}이라는 계획을 함께 보면 성급한 확정보다 비교 기준을 먼저 만드는 쪽을 추천합니다. ${chart.dayMaster.korean}${chart.dayMaster.element}에서 읽은 ${elementTone[chart.dayMaster.element]}을 활용해 선택지 두 개의 성장 가능성·안정성·필요 비용을 표로 비교해보세요. 이 답변은 샘플 규칙으로 만든 참고 의견이며 실제 미래를 확정하지 않습니다.`;
}
