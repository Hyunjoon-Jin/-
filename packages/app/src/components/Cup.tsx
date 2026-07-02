import { isCupOver, cupSurvivors, nextCupPairings, type CupTie } from '@soccer-tycoon/engine';
import { watchCupSetup, type GameState } from '../game.js';

interface Props {
  game: GameState;
  onPlayCupRound: () => void;
  onWatchCup: () => void;
}

/** 대진 카드 한 줄 높이(간격 포함, px) — 라운드별 컬럼 높이를 맞춰 브래킷 모양을 만든다. */
const ROW_HEIGHT = 68;

/** 이변 판정 기준: 두 구단 평판 격차가 이 이상이고 평판 낮은 쪽이 이기면 이변. */
const UPSET_REPUTATION_GAP = 3;

export function Cup({ game, onPlayCupRound, onWatchCup }: Props) {
  const cup = game.cup;
  if (!cup) {
    return <p className="muted">컵대회는 시즌 시작(킥오프) 후 진행됩니다. "경기" 탭에서 시즌을 시작하세요.</p>;
  }

  const nameOf = (id: string | null) =>
    id ? (game.clubs.find((c) => c.id === id)?.name ?? id) : '부전승';
  const reputationOf = (id: string) => game.clubs.find((c) => c.id === id)?.finance.reputation ?? 0;
  /** 평판이 확실히 낮은 쪽이 이기면 이변으로 본다(부전승 제외). */
  const isUpset = (tie: CupTie): boolean => {
    if (tie.awayId === null) return false;
    const homeRep = reputationOf(tie.homeId);
    const awayRep = reputationOf(tie.awayId);
    const underdogId = homeRep <= awayRep ? tie.homeId : tie.awayId;
    return tie.winnerId === underdogId && Math.abs(homeRep - awayRep) >= UPSET_REPUTATION_GAP;
  };
  const mine = game.myClubId;
  const over = isCupOver(cup);
  const survivors = cupSurvivors(cup);
  const myAlive = survivors.includes(mine) || cup.championId === mine;
  const canWatch = watchCupSetup(game) !== null;
  const upcoming = !over ? nextCupPairings(cup, game.clubs) : null;

  const firstRoundTies = cup.rounds[0]?.ties.length ?? Math.max(1, Math.ceil(cup.participantIds.length / 2));
  const colHeight = firstRoundTies * ROW_HEIGHT;

  return (
    <div className="cup">
      <div className="cup-head">
        <h2>컵대회</h2>
        {over ? (
          <span className="cup-champ">🏆 우승: <b>{nameOf(cup.championId)}</b></span>
        ) : (
          <>
            <span className={myAlive ? 'cup-status alive' : 'cup-status out'}>
              {myAlive ? '우리 구단 생존 중' : '우리 구단 탈락'}
            </span>
            {canWatch && <button className="btn-advance" onClick={onWatchCup}>내 컵 경기 관전 ▶</button>}
            <button className="btn-ghost" onClick={onPlayCupRound}>컵 다음 라운드 ▶▶</button>
          </>
        )}
      </div>

      {cup.rounds.length === 0 ? (
        <p className="muted">아직 경기가 없습니다. "컵 다음 라운드"로 시작하세요. (참가 {cup.participantIds.length}개 구단)</p>
      ) : (
        <div className="bracket-scroll">
          <div className="bracket">
            {cup.rounds.map((round, ri) => (
              <div className="bracket-col" key={ri} style={{ height: colHeight }}>
                <div className="bracket-col-title">{round.name}</div>
                <div className="bracket-col-body">
                  {round.ties.map((tie, ti) => (
                    <TieCard
                      key={ti} tie={tie} mine={mine} nameOf={nameOf}
                      connector={ri < cup.rounds.length - 1 || upcoming !== null}
                      upset={isUpset(tie)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {upcoming && (
              <div className="bracket-col" style={{ height: colHeight }}>
                <div className="bracket-col-title">{upcoming.roundName} <span className="muted small">(예정)</span></div>
                <div className="bracket-col-body">
                  {upcoming.byeId && (
                    <div className="tie-card pending bye">
                      <span className="tie-side">{nameOf(upcoming.byeId)}</span>
                      <span className="tie-score muted small">부전승</span>
                    </div>
                  )}
                  {upcoming.pairings.map((pr, pi) => {
                    const involvesMe = pr.homeId === mine || pr.awayId === mine;
                    return (
                      <div key={pi} className={`tie-card pending ${involvesMe ? 'mine' : ''}`}>
                        <span className="tie-side">{nameOf(pr.homeId)}</span>
                        <span className="tie-score muted small">vs</span>
                        <span className="tie-side away">{nameOf(pr.awayId)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {over && (
              <div className="bracket-col champion-col" style={{ height: colHeight }}>
                <div className="bracket-col-title">우승</div>
                <div className="bracket-col-body">
                  <div className="tie-card champion">🏆 <b>{nameOf(cup.championId)}</b></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TieCard({
  tie, mine, nameOf, connector, upset,
}: {
  tie: CupTie;
  mine: string;
  nameOf: (id: string | null) => string;
  connector: boolean;
  upset: boolean;
}) {
  const involvesMe = tie.homeId === mine || tie.awayId === mine;
  const myWin = involvesMe && tie.winnerId === mine;
  const cls = `tie-card ${connector ? 'connector' : ''} ${involvesMe ? (myWin ? 'mine win' : 'mine loss') : ''} ${upset ? 'upset' : ''}`;
  if (tie.awayId === null) {
    return (
      <div className={`${cls} bye`}>
        <span className="tie-side"><b>{nameOf(tie.homeId)}</b></span>
        <span className="tie-score muted small">부전승</span>
      </div>
    );
  }
  return (
    <div className={cls} title={upset ? '🌟 이변! 평판이 낮은 쪽이 승리했습니다.' : undefined}>
      {upset && <span className="upset-badge">🌟 이변</span>}
      <span className={`tie-side ${tie.winnerId === tie.homeId ? 'won' : ''}`}>{nameOf(tie.homeId)}</span>
      <span className="tie-score">
        {tie.homeScore} : {tie.awayScore}{tie.penalties ? ' (PK)' : ''}
      </span>
      <span className={`tie-side away ${tie.winnerId === tie.awayId ? 'won' : ''}`}>{nameOf(tie.awayId)}</span>
    </div>
  );
}
