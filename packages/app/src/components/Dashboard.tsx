import { useEffect, useState, type ReactNode } from 'react';
import {
  myClub, rivalClub, lastSummary, myLastPosition, managerPersona, contractOptions,
  DIFFICULTIES, DIVISION_LABELS, type GameState,
} from '../game.js';
import {
  formatMoney, currentAbility, wageBudget, annualWageBill, inFinancialCrisis,
  boardStatus, DEMAND_LABEL, type BoardStatus, type ManagerPersona,
} from '@soccer-tycoon/engine';
import { Banner } from './Banner.js';
import { InfoTip } from './InfoTip.js';

/** 대시보드에 한 번에 펼쳐 보여줄 시즌 소식 배너 수 — 나머지는 "더 보기"로 접는다. */
const VISIBLE_SEASON_BANNERS = 2;

const BOARD_LABEL: Record<BoardStatus, string> = {
  secure: '신뢰 두터움', stable: '안정적', shaky: '불안', critical: '경질 위기',
};

const PERSONA_LABEL: Record<Exclude<ManagerPersona, 'neutral'>, { label: string; desc: string }> = {
  bold: { label: '거침없는 승부사', desc: '자신감 있고 직설적인 인터뷰로 유명합니다.' },
  humble: { label: '신중한 리더', desc: '겸손하고 책임감 있는 인터뷰로 신뢰를 얻고 있습니다.' },
};

interface Props {
  game: GameState;
  onSignContract: (years: number) => void;
  /** "전술" 탭을 방문했는지 — 첫 시즌 체크리스트 진행 상황 표시용. */
  visitedTactics: boolean;
  /** "이적" 또는 "스태프" 탭을 방문했는지 — 첫 시즌 체크리스트 진행 상황 표시용. */
  visitedSquadPrep: boolean;
  onGoToTab: (tab: 'tactics' | 'transfers' | 'match') => void;
}

export function Dashboard({ game, onSignContract, visitedTactics, visitedSquadPrep, onGoToTab }: Props) {
  const club = myClub(game);
  const rival = rivalClub(game);
  const last = lastSummary(game);
  const pos = myLastPosition(game);

  const squadAvgCA =
    club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length;
  const wageBill = club.players.reduce((s, p) => s + p.wage, 0);

  const myReport = last?.finance.get(club.id);
  const firstRun = game.history.length === 0 && !game.live;

  const crisis = inFinancialCrisis(club);
  const overWages = annualWageBill(club) > wageBudget(club);
  const retiredThisSeason = last ? game.legends.filter((l) => l.season === last.season) : [];
  const persona = managerPersona(game);
  const contract = contractOptions(game);

  // 시즌 종료 배너를 중요도순으로 담아, 여러 개가 한꺼번에 세로로 쌓이지 않도록
  // 상위 몇 개만 펼쳐 보여주고 나머지는 "더 보기"로 접는다.
  const seasonBanners: { key: string; priority: number; node: ReactNode }[] = [];
  if (last?.surprise) {
    seasonBanners.push({
      key: 'surprise', priority: 1,
      node: (
        <Banner tone={last.surprise === 'overperform' ? 'info' : 'danger'}>
          <p>
            {last.surprise === 'overperform'
              ? <>🎉 <b>이변의 시즌!</b> 언론은 {last.preseasonRank}위로 예상했지만 <b>{pos}위</b>로 마쳤습니다.</>
              : <>😞 <b>실망스러운 시즌.</b> 언론은 {last.preseasonRank}위를 예상했지만 <b>{pos}위</b>에 그쳤습니다.</>}
          </p>
        </Banner>
      ),
    });
  }
  if (last?.milestones !== undefined && last.milestones.length > 0) {
    seasonBanners.push({
      key: 'milestones', priority: 2,
      node: (
        <Banner tone="success">
          {last.milestones.map((m) => (
            <p key={`${m.playerId}-${m.kind}-${m.value}`}>
              🎉 <b>{m.name}</b>, 통산 <b>{m.value}{m.kind === 'apps' ? '경기 출전' : '골'}</b> 달성!
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (retiredThisSeason.length > 0) {
    seasonBanners.push({
      key: 'retirement', priority: 3,
      node: (
        <Banner tone="gold">
          {retiredThisSeason.map((l) => (
            <p key={l.playerId}>
              🕯️ <b>{l.name}</b>({l.position})이(가) {l.finalAge}세로 은퇴했습니다 — 통산{' '}
              <b>{l.careerApps}경기</b>
              {l.careerGoals > 0 && <> <b>{l.careerGoals}골</b></>}
              {l.caps > 0 && <span className="muted"> · A매치 {l.caps}경</span>}.
              그동안 수고했습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.youthProspects !== undefined && last.youthProspects.length > 0) {
    seasonBanners.push({
      key: 'youth', priority: 4,
      node: (
        <Banner tone="info" title="🌱 이번 시즌 유스 기대주">
          {last.youthProspects.map((p) => (
            <p key={p.playerId}>
              <b>{p.name}</b> ({p.position} · {p.age}세) — 잠재력 <b>{p.potential.toFixed(0)}</b>
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.prospectUpdates !== undefined && last.prospectUpdates.length > 0) {
    seasonBanners.push({
      key: 'prospectUpdates', priority: 5,
      node: (
        <Banner tone="special" title="📣 유스 기대주 소식">
          {last.prospectUpdates.map((u) => (
            <p key={`${u.playerId}-${u.kind}`}>
              {u.kind === 'debut'
                ? <>유스 기대주 출신 <b>{u.name}</b>, 1군 <b>데뷔</b>에 성공했습니다!</>
                : <>유스 기대주 출신 <b>{u.name}</b>, 커리어 <b>첫 골</b>을 기록했습니다!</>}
            </p>
          ))}
        </Banner>
      ),
    });
  }
  seasonBanners.sort((a, b) => a.priority - b.priority);

  const [showAllBanners, setShowAllBanners] = useState(false);
  useEffect(() => { setShowAllBanners(false); }, [last?.season]);
  const visibleBanners = showAllBanners ? seasonBanners : seasonBanners.slice(0, VISIBLE_SEASON_BANNERS);
  const hiddenBannerCount = seasonBanners.length - visibleBanners.length;

  const checklistKey = `checklist_dismissed_${game.seed}_${game.myClubId}`;
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => window.localStorage.getItem(checklistKey) === '1',
  );

  return (
    <div className="dashboard">
      {firstRun && !checklistDismissed && (
        <OnboardingChecklist
          clubName={club.name}
          objective={game.objective}
          difficultyLabel={DIFFICULTIES[game.difficulty].label}
          visitedTactics={visitedTactics}
          visitedSquadPrep={visitedSquadPrep}
          onGoToTab={onGoToTab}
          onDismiss={() => {
            window.localStorage.setItem(checklistKey, '1');
            setChecklistDismissed(true);
          }}
        />
      )}

      {crisis ? (
        <Banner tone="danger">
          ⚠ 재정 위기 — 보유 자금이 마이너스입니다. 선수를 매각해 자금을 확보하지 않으면
          시즌 후 보드진이 고가 선수를 강제 매각합니다.
        </Banner>
      ) : overWages ? (
        <Banner tone="warning">
          ⚠ 임금 과다 — 임금 총액이 지속가능 수준을 넘었습니다. 장기 재정에 주의하세요.
        </Banner>
      ) : null}

      <div className="objective">
        <b className="div-badge">{DIVISION_LABELS[club.division]}</b>{' '}
        🎯 보드진 목표: <b>{club.division === 1 ? '승격' : '잔류'} — {game.objective}위 이내</b>
        <span className="muted"> · 난이도 {DIFFICULTIES[game.difficulty].label}</span>
        {last && pos !== undefined && (
          <span className={pos <= game.objective ? 'obj-met' : 'obj-miss'}>
            {' '}— 지난 시즌 {pos}위 ({pos <= game.objective ? '목표 달성 ✓' : '목표 미달'})
          </span>
        )}
        <span className="muted small"> · 📝 계약 잔여 {Math.max(0, game.contractSeasonsLeft)}시즌</span>
      </div>

      <Banner tone="danger">
        🔥 라이벌: <b>{rival.name}</b>
        <span className="muted"> ({DIVISION_LABELS[rival.division]})</span>
        <span className="rival-record">
          {' '}— 통산 {game.rivalRecord.wins}승 {game.rivalRecord.draws}무 {game.rivalRecord.losses}패
        </span>
        {game.rivalMeetings.length > 0 && (
          <span className="rival-form">
            {' '}
            {game.rivalMeetings.slice(-5).map((m) => (
              <span
                key={`${m.season}-${m.competition}-${m.home}`}
                className={`form-dot ${m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}`}
              >
                {m.result === 'win' ? '승' : m.result === 'loss' ? '패' : '무'}
              </span>
            ))}
          </span>
        )}
      </Banner>

      {persona !== 'neutral' && (
        <Banner tone="special">
          🗣️ 언론이 부르는 별명: <b>{PERSONA_LABEL[persona].label}</b>
          <span className="muted"> — {PERSONA_LABEL[persona].desc}</span>
        </Banner>
      )}

      {contract && (
        <Banner tone="gold" title="📝 감독 계약 만료 — 갱신 제안">
          <p className="muted small">이사회가 재계약을 제안합니다. 계약 기간을 선택하세요.</p>
          <div className="contract-options">
            {contract.map((o) => (
              <button key={o.years} className="contract-opt" onClick={() => onSignContract(o.years)}>
                <div className="contract-opt-years">{o.years}년 계약</div>
                <div className="muted small">
                  신뢰도 +{o.confidenceDelta}
                  {o.ambitionDelta > 0 && <> · 장기 프로젝트(목표 순위 {o.ambitionDelta}단계 상향)</>}
                </div>
              </button>
            ))}
          </div>
        </Banner>
      )}

      <BoardConfidence value={game.boardConfidence} />

      {game.demand && (
        <Banner tone="info">
          📋 이사회 특별 요구: <b>{DEMAND_LABEL[game.demand.kind]}</b>
          <span className="muted small"> (달성 시 신뢰도 +{game.demand.reward} · 실패 시 −{game.demand.penalty})</span>
        </Banner>
      )}

      <div className="cards">
        <Card title="평판" value={`${club.finance.reputation} / 20`} />
        <Card title="보유 자금" value={formatMoney(club.finance.balance)} />
        <Card title="이적 예산" value={formatMoney(club.finance.transferBudget)} />
        <Card title="주급 총액" value={`${formatMoney(wageBill)} / 주`} />
        <Card title="스쿼드 평균 CA" value={squadAvgCA.toFixed(0)} />
        <Card title="스쿼드 인원" value={`${club.players.length}명`} />
      </div>

      <section className="panel">
        <h2>지난 시즌</h2>
        {last ? (
          <div className="last-season">
            {visibleBanners.map((b) => <div key={b.key}>{b.node}</div>)}
            {hiddenBannerCount > 0 && (
              <button className="btn-ghost season-more-btn" onClick={() => setShowAllBanners(true)}>
                이번 시즌 소식 {hiddenBannerCount}개 더 보기 ▾
              </button>
            )}
            <p>
              {last.division !== undefined && <><b>{DIVISION_LABELS[last.division]}</b> · </>}
              최종 순위: <b>{pos}위</b> / {last.table.length}팀
              {last.preseasonRank !== undefined && (
                <span className="muted small"> (언론 예상 {last.preseasonRank}위)</span>
              )}
              {last.promoted && <span className="pos"> ↑ 승격!</span>}
              {last.relegated && <span className="neg"> ↓ 강등</span>}
              &nbsp;·&nbsp; 리그 우승: <b>{last.championName}</b>
              {last.cupChampionName && (
                <> &nbsp;·&nbsp; 컵 우승: <b>{last.cupChampionName}</b></>
              )}
              {last.youthPromotions !== undefined && last.youthPromotions > 0 && (
                <> &nbsp;·&nbsp; 🎓 유스 승격: <b>{last.youthPromotions}명</b></>
              )}
              {last.fireSales !== undefined && last.fireSales > 0 && (
                <> &nbsp;·&nbsp; <span className="neg">💸 재정 강제 매각: {last.fireSales}명</span></>
              )}
              {last.nationalCallUps !== undefined && last.nationalCallUps > 0 && (
                <> &nbsp;·&nbsp; 🎽 국가대표 차출: <b>{last.nationalCallUps}명</b>
                  {last.nationalInjuries !== undefined && last.nationalInjuries > 0 && (
                    <span className="neg"> (부상 {last.nationalInjuries})</span>
                  )}
                </>
              )}
              {last.demand && (
                <> &nbsp;·&nbsp; 📋 요구 <span className={last.demand.met ? 'pos' : 'neg'}>{last.demand.met ? '달성 ✓' : '실패 ✕'}</span>
                  <span className="muted small"> ({last.demand.label})</span>
                </>
              )}
            </p>
            {myReport && (
              <p className={myReport.net >= 0 ? 'pos' : 'neg'}>
                시즌 순수익: {myReport.net >= 0 ? '+' : ''}
                {formatMoney(myReport.net)}
                <span className="muted">
                  {' '}(수입 {formatMoney(myReport.income.total)} · 지출{' '}
                  {formatMoney(myReport.expense.total)})
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="muted">아직 완료된 시즌이 없습니다. "경기" 탭에서 시즌을 시작하세요.</p>
        )}
      </section>
    </div>
  );
}

function OnboardingChecklist({
  clubName, objective, difficultyLabel, visitedTactics, visitedSquadPrep, onGoToTab, onDismiss,
}: {
  clubName: string;
  objective: number;
  difficultyLabel: string;
  visitedTactics: boolean;
  visitedSquadPrep: boolean;
  onGoToTab: (tab: 'tactics' | 'transfers' | 'match') => void;
  onDismiss: () => void;
}) {
  const steps: { done: boolean; label: string; tab: 'tactics' | 'transfers' | 'match' }[] = [
    { done: visitedTactics, label: '전술 탭에서 라인업 점검', tab: 'tactics' },
    { done: visitedSquadPrep, label: '이적·스태프로 스쿼드 보강', tab: 'transfers' },
    { done: false, label: '경기 탭에서 시즌 시작', tab: 'match' },
  ];
  return (
    <div className="checklist">
      <div className="checklist-head">
        <h2>👋 {clubName}에 오신 것을 환영합니다</h2>
        <button className="btn-ghost" onClick={onDismiss}>닫기 ✕</button>
      </div>
      <p className="muted">
        보드진의 목표는 <b>리그 {objective}위 이내</b>입니다 (난이도: {difficultyLabel}).
        내 경기는 직접 관전하며 하프타임에 전술을 바꿀 수 있습니다.
      </p>
      <ol className="checklist-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'done' : ''}>
            <button className="checklist-step" onClick={() => onGoToTab(s.tab)}>
              <span className="checklist-mark">{s.done ? '✓' : ''}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function BoardConfidence({ value }: { value: number }) {
  const status = boardStatus(value);
  return (
    <div className="board-conf">
      <div className="bc-head">
        <span>
          🏛 이사회 신뢰도
          <InfoTip title="이사회 신뢰도">
            시즌 성적이 목표 순위를 넘으면 오르고, 못 미치면 내려갑니다. 이사회 특별 요구를
            달성/실패해도 오르내립니다. 0에 가까워지면(경질 위기) 이번 시즌 목표를 놓치는 순간
            감독직에서 경질됩니다.
          </InfoTip>
        </span>
        <b className={`bc-status ${status}`}>{BOARD_LABEL[status]} · {Math.round(value)}</b>
      </div>
      <div className="bc-bar">
        <div className={`bc-fill ${status}`} style={{ width: `${value}%` }} />
      </div>
      {status === 'critical' && (
        <p className="bc-warn">⚠ 보드진 인내심이 한계입니다. 이번 시즌 목표를 달성하지 못하면 경질됩니다.</p>
      )}
    </div>
  );
}
