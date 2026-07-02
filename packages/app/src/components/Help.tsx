interface Props { onClose: () => void }

const ITEMS: { tab: string; text: string }[] = [
  { tab: '대시보드', text: '구단 재정·스쿼드 요약, 보드진 목표·이사회 신뢰도·특별 요구, 지난 시즌 성적, 라이벌 구단 통산 전적. 선수가 은퇴하거나 통산 마일스톤(50/100경기·10/25골 등)을 달성하면 배너가 표시됩니다. 신뢰도가 바닥나면 경질됩니다.' },
  { tab: '스쿼드', text: '선수 목록. 나이·CA·잠재력·컨디션(🤕 부상)·계약·가치·주급. 선수를 클릭하면 36능력치·파생 전력·고유 특성(★)·스카우팅 리포트(등급·강점/약점)를 볼 수 있습니다.' },
  { tab: '전술', text: '포메이션·라인업(베스트 XI/슬롯 교체)과 지시 슬라이더. 팀 전력 실시간 확인.' },
  { tab: '경기', text: '내 부(1·2부) 리그 진행. "관전"으로 2D 실시간 + 하프타임 개입. 경기 중 부상 발생 시 즉시 교체할지 물어봅니다. 라이벌 구단과의 경기는 "🔥 라이벌전"으로 표시됩니다. 시즌 말 승강.' },
  { tab: '컵', text: '리그 병행 단판 토너먼트. 내 컵 경기는 "관전"으로 2D 실시간 + 하프타임 개입, 또는 한 번에 시뮬. 우승 시 상금.' },
  { tab: '통계', text: '리그 득점 순위, 내 구단 시즌 기록, 시즌 어워드.' },
  { tab: '이적', text: '(프리시즌) 영입은 협상제(제안→수락/역제안/거절, 핵심 선수일수록 호가↑). 판매는 관심 구단들의 입찰 중 선택. 방출도 가능.' },
  { tab: '스태프', text: '코칭(성장)·의료(부상)·스카우팅(정보)·유스(유망주) 업그레이드.' },
  { tab: '히스토리', text: '명예의 전당(내 구단 우승·최고순위)과 역대 시즌·구단별 우승 순위·통산 득점 순위·은퇴 선수 레전드 아카이브.' },
];

export function Help({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>도움말 — 화면 안내</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <ul className="help-list">
          {ITEMS.map((it) => (
            <li key={it.tab}>
              <b className="help-tab">{it.tab}</b>
              <span className="muted">{it.text}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          팁: 매 경기를 뛴 선발은 컨디션이 떨어집니다. 중요한 경기 전에는 스쿼드를 로테이션하세요.
          관전 중 부상이 발생하면 즉시 교체하거나 계속 뛰게 둘 수 있습니다. 모든 진행은 자동 저장됩니다.
        </p>
      </div>
    </div>
  );
}
