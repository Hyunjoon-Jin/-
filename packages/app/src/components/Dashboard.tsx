import { useEffect, useState, type ReactNode } from 'react';
import {
  myClub, rivalClub, lastSummary, myLastPosition, managerPersona, managerSnsReputation, contractOptions,
  thinSquadLines, LINE_DEPTH_RECOMMENDED,
  DIFFICULTIES, DIVISION_LABELS, type GameState, type ActionOutcome,
} from '../game.js';
import {
  formatMoney, currentAbility, wageBudget, annualWageBill, inFinancialCrisis,
  boardStatus, DEMAND_LABEL, SPONSOR_GOAL_LABEL, sponsorStreakMultiplier, SPONSOR_CONTRACT_LABEL,
  boldPredictionTarget, ADD_ON_CONDITION_LABEL,
  FAN_SATISFACTION_DEFAULT, FAN_PROTEST_THRESHOLD,
  type BoardStatus, type ManagerPersona, type BoardPersona, type Line, type NamedStaffKind,
} from '@soccer-tycoon/engine';
import { Landmark } from 'lucide-react';
import { Banner } from './Banner.js';
import { InfoTip } from './InfoTip.js';
import { useResultToast } from '../toast.js';

/** 대시보드에 한 번에 펼쳐 보여줄 시즌 소식 배너 수 — 나머지는 "더 보기"로 접는다. */
const VISIBLE_SEASON_BANNERS = 2;

const BOARD_LABEL: Record<BoardStatus, string> = {
  secure: '신뢰 두터움', stable: '안정적', shaky: '불안', critical: '경질 위기',
};

const PERSONA_LABEL: Record<Exclude<ManagerPersona, 'neutral'>, { label: string; desc: string }> = {
  bold: { label: '거침없는 승부사', desc: '자신감 있고 직설적인 인터뷰로 유명합니다.' },
  humble: { label: '신중한 리더', desc: '겸손하고 책임감 있는 인터뷰로 신뢰를 얻고 있습니다.' },
};

const PATIENCE_LABEL: Record<BoardPersona['patience'], string> = {
  patient: '인내심 있음', impatient: '조급함',
};

const STAFF_NAMED_KIND_LABEL: Record<NamedStaffKind, string> = {
  coaching: '총괄 코치', medical: '의료', scouting: '스카우팅', youth: '유스',
};
const STYLE_LABEL: Record<BoardPersona['style'], string> = {
  conservative: '재정 보수적', aggressive: '성적 지상주의',
};

const LINE_LABEL: Record<Line, string> = { GK: 'GK', DEF: '수비', MID: '미드필드', ATT: '공격' };

interface Props {
  game: GameState;
  onSignContract: (years: number) => void;
  /** "전술" 탭을 방문했는지 — 첫 시즌 체크리스트 진행 상황 표시용. */
  visitedTactics: boolean;
  /** "이적" 또는 "스태프" 탭을 방문했는지 — 첫 시즌 체크리스트 진행 상황 표시용. */
  visitedSquadPrep: boolean;
  onGoToTab: (tab: 'tactics' | 'transfers' | 'match') => void;
  onRenegotiateDemand: () => ActionOutcome;
  onDeclareBoldPrediction: () => ActionOutcome;
}

export function Dashboard({
  game, onSignContract, visitedTactics, visitedSquadPrep, onGoToTab, onRenegotiateDemand,
  onDeclareBoldPrediction,
}: Props) {
  const club = myClub(game);
  const rival = rivalClub(game);
  const last = lastSummary(game);
  const pos = myLastPosition(game);
  const toast = useResultToast();

  const squadAvgCA =
    club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length;
  const wageBill = club.players.reduce((s, p) => s + p.wage, 0);
  const fanSatisfaction = club.finance.fanSatisfaction ?? FAN_SATISFACTION_DEFAULT;

  const myReport = last?.finance.get(club.id);
  const firstRun = game.history.length === 0 && !game.live;

  const crisis = inFinancialCrisis(club);
  const overWages = annualWageBill(club) > wageBudget(club);
  const thinLines = thinSquadLines(game);
  const retiredThisSeason = last ? game.legends.filter((l) => l.season === last.season) : [];
  const persona = managerPersona(game);
  const sns = managerSnsReputation(game);
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
  if (last?.promotionPlayoff) {
    const pp = last.promotionPlayoff;
    const iParticipated = pp.participants.some((p) => p.clubId === game.myClubId);
    const iWon = pp.championId === game.myClubId;
    seasonBanners.push({
      key: 'promotionPlayoff', priority: 1.5,
      node: (
        <Banner tone={iWon ? 'success' : iParticipated ? 'danger' : 'info'}>
          <p>
            🏆 <b>승격 플레이오프</b> — 2부 3~6위 4개 구단이 마지막 승격 자리를 놓고 겨룬 결과{' '}
            <b>{pp.championName}</b>이(가) 승격을 확정지었습니다.
            {iWon && <span className="pos"> 우리 구단이 우승했습니다! 🎉</span>}
            {iParticipated && !iWon && <span className="neg"> 아쉽게도 우리 구단은 탈락했습니다.</span>}
          </p>
        </Banner>
      ),
    });
  }
  const careerMilestones = last?.milestones?.filter((m) => m.kind !== 'positionMastery') ?? [];
  if (careerMilestones.length > 0) {
    seasonBanners.push({
      key: 'milestones', priority: 2,
      node: (
        <Banner tone="success">
          {careerMilestones.map((m) => (
            <p key={`${m.playerId}-${m.kind}-${m.value}`}>
              🎉 <b>{m.name}</b>, 통산 <b>{m.value}{m.kind === 'apps' ? '경기 출전' : '골'}</b> 달성!
            </p>
          ))}
        </Banner>
      ),
    });
  }
  const positionMilestones = last?.milestones?.filter((m) => m.kind === 'positionMastery') ?? [];
  if (positionMilestones.length > 0) {
    seasonBanners.push({
      key: 'positionMilestones', priority: 2,
      node: (
        <Banner tone="info">
          {positionMilestones.map((m) => (
            <p key={`${m.playerId}-${m.position}-${m.value}`}>
              🎯 <b>{m.name}</b>, <b>{m.position}</b> 포지션 전환 훈련 숙련도 <b>{m.value}%</b> 달성!
              {m.value >= 100 && ' 완전히 전환을 마쳤습니다.'}
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
  if (last?.reservePromotions !== undefined && last.reservePromotions.length > 0) {
    seasonBanners.push({
      key: 'reservePromotions', priority: 4.5,
      node: (
        <Banner tone="success" title="⬆️ 리저브 승격">
          {last.reservePromotions.map((r) => (
            <p key={r.playerId}>
              <b>{r.name}</b>({r.position}) 선수가 리저브에서 1군으로 승격했습니다!
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.reserveLeagueTable !== undefined && last.reserveLeagueTable.length > 0) {
    const myRow = last.reserveLeagueTable.find((r) => r.clubId === game.myClubId);
    if (myRow) {
      const myPos = last.reserveLeagueTable.findIndex((r) => r.clubId === game.myClubId) + 1;
      const isChampion = myPos === 1;
      seasonBanners.push({
        key: 'reserveLeague', priority: 5,
        node: (
          <Banner tone={isChampion ? 'success' : 'info'} title="🏟️ 리저브 리그">
            <p>
              우리 리저브팀이 {last.reserveLeagueTable.length}팀 중 <b>{myPos}위</b>로 시즌을 마쳤습니다
              ({myRow.won}승 {myRow.drawn}무 {myRow.lost}패, 득실 {myRow.gf - myRow.ga > 0 ? '+' : ''}{myRow.gf - myRow.ga}).
              {isChampion && ' 우승 보너스로 리저브 전원의 사기가 올랐습니다!'}
            </p>
            {last.reservePlayerStats !== undefined && last.reservePlayerStats.length > 0 && (() => {
              const topScorer = [...last.reservePlayerStats].sort((a, b) => b.goals - a.goals)[0]!;
              return topScorer.goals > 0 && (
                <p className="muted small">
                  개인 기록: <b>{topScorer.name}</b> {topScorer.goals}골 {topScorer.assists}도움({topScorer.apps}경기)
                  · 스태프 탭에서 리저브 개인 기록 전체를 볼 수 있습니다.
                </p>
              );
            })()}
          </Banner>
        ),
      });
    }
  }
  if (last?.internationalRetirements !== undefined && last.internationalRetirements.length > 0) {
    seasonBanners.push({
      key: 'internationalRetirements', priority: 6.2,
      node: (
        <Banner tone="info" title="🏳️ 국가대표 은퇴">
          {last.internationalRetirements.map((r) => (
            <p key={r.playerId}>
              <b>{r.name}</b> 선수가 A매치 {r.caps}캡을 뒤로하고 국가대표에서 은퇴를 선언했습니다.
              앞으로 구단 커리어에만 집중합니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.academyAlumni !== undefined && last.academyAlumni.length > 0) {
    const sortedAlumni = [...last.academyAlumni].sort((a, b) => b.seasonGoals - a.seasonGoals);
    seasonBanners.push({
      key: 'academyAlumni', priority: 5.5,
      node: (
        <Banner tone="special" title="🎓 동문 소식">
          {sortedAlumni.map((a) => (
            <p key={a.playerId}>
              우리 유스 출신 <b>{a.name}</b>({a.position}), 현재 <b>{a.clubName}</b> 소속으로
              이번 시즌 {a.seasonApps}경기 <b>{a.seasonGoals}골</b>을 기록했습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.loanReturns !== undefined && last.loanReturns.length > 0) {
    seasonBanners.push({
      key: 'loanReturns', priority: 6,
      node: (
        <Banner tone="info" title="🔁 임대 복귀">
          {last.loanReturns.map((r) => (
            <p key={r.playerId}>
              {r.toClubId === game.myClubId
                ? <><b>{r.name}</b> 선수가 <b>{r.fromClubName}</b> 임대를 마치고 복귀했습니다.</>
                : <><b>{r.name}</b> 선수가 임대를 마치고 <b>{r.toClubName}</b>(으)로 복귀했습니다.</>}
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.loanObligations !== undefined && last.loanObligations.length > 0) {
    seasonBanners.push({
      key: 'loanObligations', priority: 6.5,
      node: (
        <Banner tone="success" title="📝 의무완전이적 발동">
          {last.loanObligations.map((o) => (
            <p key={o.playerId}>
              {o.toClubId === game.myClubId
                ? <><b>{o.name}</b> 선수가 출전 기준을 채워 <b>{formatMoney(o.fee)}</b>에 완전 영입됐습니다.</>
                : <><b>{o.name}</b> 선수가 <b>{o.toClubName}</b>에서 출전 기준을 채워 <b>{formatMoney(o.fee)}</b>에 완전 이적됐습니다.</>}
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.staffDepartures !== undefined && last.staffDepartures.length > 0) {
    seasonBanners.push({
      key: 'staffDepartures', priority: 7,
      node: (
        <Banner tone="warning" title="🚪 스태프 이적">
          {last.staffDepartures.map((d) => (
            <p key={d.kind}>
              <b>{STAFF_NAMED_KIND_LABEL[d.kind]}</b> {d.name} 코치가 계약 만료로 타 구단에 스카우트됐습니다.
              후임으로 <b>{d.replacementName}</b>을(를) 영입했습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.staffRetirements !== undefined && last.staffRetirements.length > 0) {
    seasonBanners.push({
      key: 'staffRetirements', priority: 7.2,
      node: (
        <Banner tone="info" title="🎉 스태프 은퇴">
          {last.staffRetirements.map((r) => (
            <p key={r.kind}>
              <b>{STAFF_NAMED_KIND_LABEL[r.kind]}</b> {r.name} 코치가 {r.finalAge}세로 은퇴했습니다.
              후임으로 <b>{r.replacementName}</b>을(를) 영입했습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.sponsorContractExpired !== undefined && last.sponsorContractExpired.length > 0) {
    seasonBanners.push({
      key: 'sponsorContractExpired', priority: 6.9,
      node: (
        <Banner tone="warning" title="🤝 스폰서 계약 만료">
          {last.sponsorContractExpired.map((kind) => (
            <p key={kind}>
              <b>{SPONSOR_CONTRACT_LABEL[kind]}</b> 계약이 만료됐습니다. 재계약하지 않으면 이번
              시즌부터 해당 고정 수익이 끊깁니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.watchlistContractAlerts !== undefined && last.watchlistContractAlerts.length > 0) {
    seasonBanners.push({
      key: 'watchlistContractAlerts', priority: 6.4,
      node: (
        <Banner tone="gold" title="⭐ 관심 선수 소식">
          {last.watchlistContractAlerts.map((a) => (
            <p key={a.playerId}>
              <b>{a.name}</b>({a.clubName})의 계약이 마지막 해로 접어들었습니다 — 다음 시즌 자유
              이적/저렴한 영입을 노려볼 수 있습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.cupUpsets !== undefined && last.cupUpsets.length > 0) {
    seasonBanners.push({
      key: 'cupUpsets', priority: 5.8,
      node: (
        <>
          {last.cupUpsets.map((u) => {
            const won = u.winnerId === game.myClubId;
            return (
              <Banner key={`${u.round}-${u.winnerId}-${u.loserId}`} tone={won ? 'success' : 'danger'}>
                {won
                  ? <>🎉 <b>이변의 주인공!</b> {u.round}에서 <b>{u.loserName}</b>을(를) 꺾었습니다
                      (평판 격차 {u.repGap}).</>
                  : <>😱 <b>이변의 희생양…</b> {u.round}에서 <b>{u.winnerName}</b>에게 발목을 잡혔습니다
                      (평판 격차 {u.repGap}).</>}
              </Banner>
            );
          })}
        </>
      ),
    });
  }
  if (last?.boardTierBonus !== undefined) {
    seasonBanners.push({
      key: 'boardTierBonus', priority: 3,
      node: (
        <Banner tone="success" title="💼 이사회 투자 예산 승인">
          이사회 신뢰도가 <b>{BOARD_LABEL[last.boardTierBonus.fromStatus]}</b> → <b>{BOARD_LABEL[last.boardTierBonus.toStatus]}</b>(으)로
          상승해, 추가 투자 예산 <b>{formatMoney(last.boardTierBonus.amount)}</b>을(를) 승인했습니다.
        </Banner>
      ),
    });
  }
  if (last?.addOnPayouts !== undefined && last.addOnPayouts.length > 0) {
    seasonBanners.push({
      key: 'addOnPayouts', priority: 6.7,
      node: (
        <Banner tone="warning" title="💰 성과 기반 후불 이적료 발동">
          {last.addOnPayouts.map((a, i) => (
            <p key={`${a.playerId}-${i}`}>
              {a.fromClubId === game.myClubId
                ? <><b>{a.name}</b> 선수가 {ADD_ON_CONDITION_LABEL[a.tierKind]} {a.tierThreshold} 조건을 달성해 <b>{a.toClubName}</b>에 추가 이적료 <b>{formatMoney(a.fee)}</b>을(를) 지급했습니다.</>
                : <><b>{a.name}</b> 선수가 <b>{a.fromClubName}</b>에서 {ADD_ON_CONDITION_LABEL[a.tierKind]} {a.tierThreshold} 조건을 달성해 추가 이적료 <b>{formatMoney(a.fee)}</b>을(를) 받았습니다.</>}
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.mentorGraduations !== undefined && last.mentorGraduations.length > 0) {
    seasonBanners.push({
      key: 'mentorGraduations', priority: 6.8,
      node: (
        <Banner tone="success" title="🎓 멘토링 졸업">
          {last.mentorGraduations.map((g) => (
            <p key={g.menteeId}>
              <b>{g.menteeName}</b> 선수가 {g.reason === 'age' ? '유망주 나이를 넘어서며' : '멘토의 기량을 넘어서며'} <b>{g.mentorName}</b>와(과)의 멘토링을 졸업했습니다.
            </p>
          ))}
        </Banner>
      ),
    });
  }
  if (last?.boardPersonaChange !== undefined) {
    const change = last.boardPersonaChange;
    seasonBanners.push({
      key: 'boardPersonaChange', priority: 1.8,
      node: (
        <Banner tone="info" title="🪑 회장 교체">
          <p>
            새 회장이 취임하며 이사회 성향이 바뀌었습니다 —{' '}
            <b>{PATIENCE_LABEL[change.oldPersona.patience]} · {STYLE_LABEL[change.oldPersona.style]}</b>
            {' '}에서{' '}
            <b>{PATIENCE_LABEL[change.newPersona.patience]} · {STYLE_LABEL[change.newPersona.style]}</b>
            {' '}(으)로 바뀌었습니다.
          </p>
        </Banner>
      ),
    });
  }
  if (last?.longTermProjectBonus !== undefined) {
    const { milestone, bonus } = last.longTermProjectBonus;
    seasonBanners.push({
      key: 'longTermProjectBonus', priority: 1.7,
      node: (
        <Banner tone="success" title="🏗️ 장기 프로젝트 보너스">
          <p>
            이사회 목표를 <b>{milestone}시즌</b> 연속 달성해 이사회가 장기 프로젝트에
            신뢰를 보냈습니다 — 예산 <b>+{formatMoney(bonus)}</b>이 지급되었습니다.
          </p>
        </Banner>
      ),
    });
  }
  if (last?.fanProtest) {
    seasonBanners.push({
      key: 'fanProtest', priority: 1.9,
      node: (
        <Banner tone="danger" title="📢 팬 시위">
          <p>
            팬 만족도가 바닥나며 서포터즈가 시위에 나섰습니다 — 현재 만족도{' '}
            <b>{last.fanSatisfaction}</b>. 다음 시즌 매치데이 수익이 한동안 줄어듭니다.
          </p>
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

      {thinLines.length > 0 && (
        <Banner tone="warning">
          ⚠ 스쿼드 뎁스 부족 — {thinLines.map(({ line, count }) => (
            `${LINE_LABEL[line]}(${count}/${LINE_DEPTH_RECOMMENDED[line]}명)`
          )).join(', ')}. 부상·정지가 겹치면 라인이 통째로 빌 수 있습니다. 이적 시장에서 보강을 고려하세요.
        </Banner>
      )}

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
      <Banner tone="info">
        📱 감독 SNS — 팔로워 <b>{sns.followers.toLocaleString()}</b>명 · 여론 지지율{' '}
        <b>{sns.approval}</b>%
        <span className="muted">
          {' '}(자신감 있는 답변은 화제성을 키우고, 겸손한 답변은 지지율을 쌓습니다)
        </span>
      </Banner>

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

      <BoardConfidence value={game.boardConfidence} persona={club.boardPersona} />

      {game.demand && (
        <Banner tone="info">
          📋 이사회 특별 요구: <b>{DEMAND_LABEL[game.demand.kind]}</b>
          <span className="muted small"> (달성 시 신뢰도 +{game.demand.reward} · 실패 시 −{game.demand.penalty})</span>
          {!game.demandRenegotiated && (
            <button
              className="btn-small demand-renegotiate-btn"
              onClick={() => toast(onRenegotiateDemand())}
              title="이사회에 요구 강도 완화를 요청합니다. 신뢰도를 조금 지불하며, 조급한 이사회는 거절할 수 있습니다."
            >
              🤝 재협상 요청
            </button>
          )}
        </Banner>
      )}

      {game.sponsorGoal && (() => {
        const streak = game.sponsorStreak ?? 0;
        const previewBonus = Math.round(game.sponsorGoal.bonus * sponsorStreakMultiplier(streak));
        return (
          <Banner tone="gold">
            💰 스폰서 보너스 목표: <b>{SPONSOR_GOAL_LABEL[game.sponsorGoal.kind]}</b>
            <span className="muted small"> (달성 시 {formatMoney(previewBonus)} 일시불 지급)</span>
            {streak > 0 && (
              <span className="muted small"> · 🔥 연속 달성 {streak}회(배율 ×{sponsorStreakMultiplier(streak).toFixed(1)})</span>
            )}
          </Banner>
        );
      })()}

      {game.live && game.live.results.length === 0 && game.boldPrediction === undefined && (
        <Banner tone="info">
          🎤 대담한 목표를 공개 선언하시겠습니까? 선언하면 목표가 <b>{boldPredictionTarget(game.objective)}위</b> 이내로
          상향되고, 달성 시 이사회 신뢰도 보너스를, 원래 목표(<b>{game.objective}위</b>)조차 놓치면 추가 페널티를 받습니다.
          <button
            className="btn-small"
            onClick={() => toast(onDeclareBoldPrediction())}
            title="시즌 시작 전(첫 경기 전)에만, 시즌당 1회만 선언할 수 있습니다."
          >
            🎤 선언하기
          </button>
        </Banner>
      )}
      {game.boldPrediction !== undefined && (
        <Banner tone="warning">
          🎤 대담한 목표 선언 중 — 리그 <b>{game.boldPrediction}위</b> 이내
        </Banner>
      )}

      <div className="cards">
        <Card title="평판" value={`${club.finance.reputation} / 20`} />
        <Card title="보유 자금" value={formatMoney(club.finance.balance)} emphasis />
        <Card title="이적 예산" value={formatMoney(club.finance.transferBudget)} />
        <Card title="주급 총액" value={`${formatMoney(wageBill)} / 주`} />
        <Card title="스쿼드 평균 CA" value={squadAvgCA.toFixed(0)} />
        <Card title="스쿼드 인원" value={`${club.players.length}명`} />
        <Card
          title="팬 만족도"
          value={`${fanSatisfaction}${fanSatisfaction < FAN_PROTEST_THRESHOLD ? ' 😠' : fanSatisfaction >= 80 ? ' 😀' : ''} / 100`}
        />
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
              {last.continentalCupChampionName && (
                <> &nbsp;·&nbsp; 🌍 대륙컵 우승: <b>{last.continentalCupChampionName}</b></>
              )}
              {last.qualifiedForContinental && (
                <> &nbsp;·&nbsp; <span className="pos">🎟️ 다음 시즌 대륙컵 진출 확정!</span></>
              )}
              {last.youthPromotions !== undefined && last.youthPromotions > 0 && (
                <> &nbsp;·&nbsp; 🎓 유스 승격: <b>{last.youthPromotions}명</b></>
              )}
              {last.fireSales !== undefined && last.fireSales > 0 && (
                <> &nbsp;·&nbsp; <span className="neg">💸 재정 강제 매각: {last.fireSales}명</span></>
              )}
              {last.ffpStage === 'warning' && (
                <> &nbsp;·&nbsp; <span className="neg">
                  ⚠️ 재정 위기 경고 — 이적 예산 동결(다음 시즌도 적자면 제재가 뒤따릅니다)
                </span></>
              )}
              {last.ffpStage === 'sanction' && (
                <> &nbsp;·&nbsp; <span className="neg">
                  🚨 재정 위기 제재 — 이적 예산 동결 · 임금 삭감(다음 시즌도 적자면 강제 매각)
                </span></>
              )}
              {last.internationalTournamentChampion !== undefined && (
                <> &nbsp;·&nbsp; 🌍 국제대회 우승: <b>{last.internationalTournamentChampion ?? '무산(참가국 부족)'}</b></>
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
              {last.boldPrediction && (
                <> &nbsp;·&nbsp; 🎤 대담한 목표(<b>{last.boldPrediction.declaredTarget}위</b>){' '}
                  <span className={last.boldPrediction.met ? 'pos' : last.boldPrediction.missedObjective ? 'neg' : ''}>
                    {last.boldPrediction.met ? '달성 ✓' : last.boldPrediction.missedObjective ? '실패(목표 미달) ✕' : '미달성'}
                  </span>
                </>
              )}
              {last.sponsorGoal && (
                <> &nbsp;·&nbsp; 💰 스폰서 목표 <span className={last.sponsorGoal.met ? 'pos' : 'neg'}>
                  {last.sponsorGoal.met ? `달성 ✓ (+${formatMoney(last.sponsorGoal.bonus)})` : '실패 ✕'}
                </span>
                  <span className="muted small"> ({last.sponsorGoal.label})</span>
                </>
              )}
            </p>
            {myReport && (
              <>
                <p className={myReport.net >= 0 ? 'pos' : 'neg'}>
                  시즌 순수익: {myReport.net >= 0 ? '+' : ''}
                  {formatMoney(myReport.net)}
                  <span className="muted">
                    {' '}(수입 {formatMoney(myReport.income.total)} · 지출{' '}
                    {formatMoney(myReport.expense.total)})
                  </span>
                </p>
                <p className="muted small finance-breakdown">
                  중계 {formatMoney(myReport.income.tv)}
                  <InfoTip title="중계권료">
                    균등 분배분 + 평판 비례분에, 이번 시즌 최종 순위가 높을수록(1위에 가까울수록)
                    추가되는 순위 배당이 더해집니다. 시청 수요가 상위권 경기에 몰린다는 가정입니다.
                  </InfoTip>
                  {' · '}매치데이 {formatMoney(myReport.income.matchday)}
                  {myReport.rivalBonus !== undefined && (
                    <span> (라이벌전 홈경기 프리미엄 +{formatMoney(myReport.rivalBonus)} 포함)</span>
                  )}
                  {' · '}
                  스폰서 {formatMoney(myReport.income.sponsor)} · 상금 {formatMoney(myReport.income.prize)}
                  {' · '}인건비 {formatMoney(myReport.expense.wages)} · 운영비 {formatMoney(myReport.expense.operations)}
                </p>
              </>
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

function Card({ title, value, emphasis }: { title: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'stat-card emphasis' : 'stat-card'}>
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function BoardConfidence({ value, persona }: { value: number; persona?: BoardPersona }) {
  const status = boardStatus(value);
  return (
    <div className="board-conf">
      <div className="bc-head">
        <span className="bc-title">
          <Landmark size={16} strokeWidth={2} /> 이사회 신뢰도
          <InfoTip title="이사회 신뢰도">
            시즌 성적이 목표 순위를 넘으면 오르고, 못 미치면 내려갑니다. 이사회 특별 요구를
            달성/실패해도 오르내립니다. 0에 가까워지면(경질 위기) 이번 시즌 목표를 놓치는 순간
            감독직에서 경질됩니다.
            {persona && (
              <> 이 구단의 이사회는 <b>{PATIENCE_LABEL[persona.patience]}</b> ·{' '}
                <b>{STYLE_LABEL[persona.style]}</b> 성향입니다.</>
            )}
          </InfoTip>
        </span>
        <b className={`bc-status ${status}`}>{BOARD_LABEL[status]} · {Math.round(value)}</b>
      </div>
      {persona && (
        <p className="bc-persona muted small">
          {PATIENCE_LABEL[persona.patience]} · {STYLE_LABEL[persona.style]}
        </p>
      )}
      <div className="bc-bar">
        <div className={`bc-fill ${status}`} style={{ width: `${value}%` }} />
      </div>
      {status === 'critical' && (
        <p className="bc-warn">⚠ 보드진 인내심이 한계입니다. 이번 시즌 목표를 달성하지 못하면 경질됩니다.</p>
      )}
    </div>
  );
}
