import { isCupOver, cupSurvivors } from '@soccer-tycoon/engine';
import { watchCupSetup, type GameState } from '../game.js';

interface Props {
  game: GameState;
  onPlayCupRound: () => void;
  onWatchCup: () => void;
}

export function Cup({ game, onPlayCupRound, onWatchCup }: Props) {
  const cup = game.cup;
  if (!cup) {
    return <p className="muted">컵대회는 시즌 시작(킥오프) 후 진행됩니다. "경기" 탭에서 시즌을 시작하세요.</p>;
  }

  const nameOf = (id: string | null) =>
    id ? (game.clubs.find((c) => c.id === id)?.name ?? id) : '부전승';
  const mine = game.myClubId;
  const over = isCupOver(cup);
  const survivors = cupSurvivors(cup);
  const myAlive = survivors.includes(mine) || cup.championId === mine;
  const canWatch = watchCupSetup(game) !== null;

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

      <div className="cup-rounds">
        {cup.rounds.length === 0 && (
          <p className="muted">아직 경기가 없습니다. "컵 다음 라운드"로 시작하세요. (참가 {cup.participantIds.length}개 구단)</p>
        )}
        {cup.rounds.map((round, ri) => (
          <div className="cup-round" key={ri}>
            <h3>{round.name}</h3>
            <ul className="cup-ties">
              {round.ties.map((tie, ti) => {
                const involvesMe = tie.homeId === mine || tie.awayId === mine;
                const myWin = involvesMe && tie.winnerId === mine;
                return (
                  <li key={ti} className={involvesMe ? (myWin ? 'tie mine win' : 'tie mine loss') : 'tie'}>
                    {tie.awayId === null ? (
                      <span className="tie-bye"><b>{nameOf(tie.homeId)}</b> 부전승</span>
                    ) : (
                      <>
                        <span className={`tie-side ${tie.winnerId === tie.homeId ? 'won' : ''}`}>
                          {nameOf(tie.homeId)}
                        </span>
                        <span className="tie-score">
                          {tie.homeScore} : {tie.awayScore}{tie.penalties ? ' (승부차기)' : ''}
                        </span>
                        <span className={`tie-side away ${tie.winnerId === tie.awayId ? 'won' : ''}`}>
                          {nameOf(tie.awayId)}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
