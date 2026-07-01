interface Props { onClose: () => void }

const ITEMS: { tab: string; text: string }[] = [
  { tab: '대시보드', text: '구단 재정·스쿼드 요약과 보드진 목표, 지난 시즌 성적.' },
  { tab: '스쿼드', text: '선수 목록. 나이·CA·잠재력·컨디션(🤕 부상)·계약·가치·주급.' },
  { tab: '전술', text: '포메이션·라인업(베스트 XI/슬롯 교체)과 지시 슬라이더. 팀 전력 실시간 확인.' },
  { tab: '경기', text: '내 부(1·2부) 리그 진행. "관전"으로 2D 실시간 + 하프타임 개입. 시즌 말 승강.' },
  { tab: '컵', text: '리그 병행 단판 토너먼트. 우승 시 상금.' },
  { tab: '통계', text: '리그 득점 순위, 내 구단 시즌 기록, 시즌 어워드.' },
  { tab: '이적', text: '(프리시즌) 선수 영입/판매/방출. 스카우팅이 매물 잠재력 정보를 좌우.' },
  { tab: '스태프', text: '코칭(성장)·의료(부상)·스카우팅(정보)·유스(유망주) 업그레이드.' },
  { tab: '히스토리', text: '명예의 전당(내 구단 우승·최고순위)과 역대 시즌·구단별 우승 순위.' },
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
          모든 진행은 자동 저장됩니다.
        </p>
      </div>
    </div>
  );
}
