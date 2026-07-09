import { type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import {
  isCupOver, cupSurvivors, nextCupPairings, cupTieAggregate, type CupTie, type CupState, type Club,
} from '@soccer-tycoon/engine';
import { watchCupSetup, type GameState } from '../game.js';
import { EmptyState } from './EmptyState.js';

interface Props {
  game: GameState;
  onPlayCupRound: () => void;
  onWatchCup: () => void;
  onPlayContinentalCupRound: () => void;
}

/** 대진 카드 한 줄 높이(간격 포함, px) — 라운드별 컬럼 높이를 맞춰 브래킷 모양을 만든다. */
const ROW_HEIGHT = 68;

/** 이변 판정 기준: 두 구단 평판 격차가 이 이상이고 평판 낮은 쪽이 이기면 이변. */
const UPSET_REPUTATION_GAP = 3;

/** 프리시즌 컵 우승 후보로 보여줄 상위 인원 수. */
const CUP_FAVORITES_SHOWN = 5;

export function Cup({ game, onPlayCupRound, onWatchCup, onPlayContinentalCupRound }: Props) {
  const cup = game.cup;
  if (!cup) {
    return (
      <EmptyState
        icon={Trophy}
        title="컵대회는 시즌 시작 후 진행됩니다"
        hint={'"경기" 탭에서 시즌을 시작(킥오프)하세요.'}
      />
    );
  }

  const mine = game.myClubId;
  const canWatch = watchCupSetup(game) !== null;

  const favorites = game.live?.cupFavorites ?? [];
  const myFavRank = favorites.find((f) => f.clubId === mine)?.predictedPos;
  const champWasFavorite = isCupOver(cup) && cup.championId
    ? favorites.slice(0, CUP_FAVORITES_SHOWN).some((f) => f.clubId === cup.championId)
    : undefined;

  return (
    <div className="cup">
      <CupBracket
        title="컵대회"
        cup={cup}
        clubs={game.clubs}
        mine={mine}
        emptyHint="컵 다음 라운드"
        headExtra={
          !isCupOver(cup) ? (
            <>
              {canWatch && <button className="btn-advance" onClick={onWatchCup}>내 컵 경기 관전 ▶</button>}
              <button className="btn-ghost" onClick={onPlayCupRound}>컵 다음 라운드 ▶▶</button>
            </>
          ) : undefined
        }
      >
        {favorites.length > 0 && (
          <div className="cup-favorites">
            <span className="cup-favorites-title">📰 우승 후보</span>
            {favorites.slice(0, CUP_FAVORITES_SHOWN).map((f) => (
              <span
                key={f.clubId}
                className={`cup-fav-chip rank-${f.predictedPos}${f.clubId === mine ? ' mine' : ''}`}
              >
                {f.predictedPos}. {f.name}
              </span>
            ))}
            {myFavRank !== undefined && myFavRank > CUP_FAVORITES_SHOWN && (
              <span className="muted small">— 우리 구단은 {myFavRank}위 예상(후보권 밖)</span>
            )}
            {isCupOver(cup) && champWasFavorite === false && (
              <span className="upset-badge">🌟 예상 밖의 우승!</span>
            )}
          </div>
        )}
      </CupBracket>

      {game.continentalCup && (
        <CupBracket
          title="🌍 대륙컵"
          subtitle="지난 시즌 1부 상위 성적 구단만 참가하는 특별 대회"
          cup={game.continentalCup}
          clubs={game.clubs}
          mine={mine}
          emptyHint="대륙컵 다음 라운드"
          headExtra={
            !isCupOver(game.continentalCup) ? (
              <button className="btn-ghost" onClick={onPlayContinentalCupRound}>대륙컵 다음 라운드 ▶▶</button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * 컵 브래킷 한 판(국내컵·대륙컵 공용). D17에서 대륙컵을 국내컵과 같은 UI로
 * 보여주기 위해 분리 — cup.ts 엔진 로직뿐 아니라 렌더링도 전면 재사용한다.
 */
function CupBracket({
  title, subtitle, cup, clubs, mine, emptyHint, headExtra, children,
}: {
  title: string;
  subtitle?: string;
  cup: CupState;
  clubs: Club[];
  mine: string;
  emptyHint: string;
  headExtra?: ReactNode;
  children?: ReactNode;
}) {
  const nameOf = (id: string | null) =>
    id ? (clubs.find((c) => c.id === id)?.name ?? id) : '부전승';
  const reputationOf = (id: string) => clubs.find((c) => c.id === id)?.finance.reputation ?? 0;
  /** 평판이 확실히 낮은 쪽이 이기면 이변으로 본다(부전승 제외). */
  const isUpset = (tie: CupTie): boolean => {
    if (tie.awayId === null) return false;
    const homeRep = reputationOf(tie.homeId);
    const awayRep = reputationOf(tie.awayId);
    const underdogId = homeRep <= awayRep ? tie.homeId : tie.awayId;
    return tie.winnerId === underdogId && Math.abs(homeRep - awayRep) >= UPSET_REPUTATION_GAP;
  };
  const over = isCupOver(cup);
  const survivors = cupSurvivors(cup);
  const participating = cup.participantIds.includes(mine);
  const myAlive = survivors.includes(mine) || cup.championId === mine;
  const upcoming = !over ? nextCupPairings(cup, clubs) : null;

  const firstRoundTies = cup.rounds[0]?.ties.length ?? Math.max(1, Math.ceil(cup.participantIds.length / 2));
  const colHeight = firstRoundTies * ROW_HEIGHT;

  return (
    <div className="cup-bracket-section">
      <div className="cup-head">
        <h2>{title}</h2>
        {over ? (
          <span className="cup-champ">🏆 우승: <b>{nameOf(cup.championId)}</b></span>
        ) : (
          <>
            {participating && (
              <span className={myAlive ? 'cup-status alive' : 'cup-status out'}>
                {myAlive ? '우리 구단 생존 중' : '우리 구단 탈락'}
              </span>
            )}
            {headExtra}
          </>
        )}
      </div>
      {subtitle && <p className="muted small">{subtitle}</p>}

      {children}

      {cup.rounds.length === 0 ? (
        <p className="muted">아직 경기가 없습니다. "{emptyHint}"로 시작하세요. (참가 {cup.participantIds.length}개 구단)</p>
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
                        <span className="tie-side">
                          {nameOf(pr.homeId)}
                          {pr.homeSeeded && <span className="seed-tag" title="추첨 시드">S</span>}
                        </span>
                        <span className="tie-score muted small">vs</span>
                        <span className="tie-side away">
                          {nameOf(pr.awayId)}
                          {!pr.homeSeeded && <span className="seed-tag" title="추첨 시드">S</span>}
                        </span>
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
  const aggregate = cupTieAggregate(tie);
  return (
    <div className={cls} title={upset ? '🌟 이변! 평판이 낮은 쪽이 승리했습니다.' : undefined}>
      {upset && <span className="upset-badge">🌟 이변</span>}
      <span className={`tie-side ${tie.winnerId === tie.homeId ? 'won' : ''}`}>{nameOf(tie.homeId)}</span>
      <span className="tie-score">
        {aggregate ? (
          <>
            합계 {aggregate[0]} : {aggregate[1]}{tie.penalties ? ' (PK)' : ''}
            <span className="tie-legs muted"> (1차 {tie.homeScore}:{tie.awayScore} · 2차 {tie.secondLeg!.homeGoals}:{tie.secondLeg!.awayGoals})</span>
          </>
        ) : (
          <>{tie.homeScore} : {tie.awayScore}{tie.penalties ? ' (PK)' : ''}</>
        )}
      </span>
      <span className={`tie-side away ${tie.winnerId === tie.awayId ? 'won' : ''}`}>{nameOf(tie.awayId)}</span>
    </div>
  );
}
