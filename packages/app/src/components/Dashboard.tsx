import { myClub, lastSummary, myLastPosition, DIFFICULTIES, type GameState } from '../game.js';
import { formatMoney, currentAbility, wageBudget, annualWageBill, inFinancialCrisis } from '@soccer-tycoon/engine';

export function Dashboard({ game }: { game: GameState }) {
  const club = myClub(game);
  const last = lastSummary(game);
  const pos = myLastPosition(game);

  const squadAvgCA =
    club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length;
  const wageBill = club.players.reduce((s, p) => s + p.wage, 0);

  const myReport = last?.finance.get(club.id);
  const firstRun = game.history.length === 0 && !game.live;

  const crisis = inFinancialCrisis(club);
  const overWages = annualWageBill(club) > wageBudget(club);

  return (
    <div className="dashboard">
      {firstRun && (
        <div className="welcome">
          <h2>👋 {club.name}에 오신 것을 환영합니다</h2>
          <p className="muted">
            보드진의 목표는 <b>리그 {game.objective}위 이내</b>입니다 (난이도: {DIFFICULTIES[game.difficulty].label}).
            먼저 <b>전술</b> 탭에서 라인업을 점검하고, 필요하면 <b>이적</b>·<b>스태프</b>로 스쿼드를 보강한 뒤,
            <b>경기</b> 탭에서 "시즌 시작"을 눌러 진행하세요. 내 경기는 직접 관전하며 하프타임에 전술을 바꿀 수 있습니다.
          </p>
        </div>
      )}

      {crisis ? (
        <div className="fin-warn crisis">
          ⚠ 재정 위기 — 보유 자금이 마이너스입니다. 선수를 매각해 자금을 확보하지 않으면
          시즌 후 보드진이 고가 선수를 강제 매각합니다.
        </div>
      ) : overWages ? (
        <div className="fin-warn caution">
          ⚠ 임금 과다 — 임금 총액이 지속가능 수준을 넘었습니다. 장기 재정에 주의하세요.
        </div>
      ) : null}

      <div className="objective">
        🎯 보드진 목표: <b>리그 {game.objective}위 이내</b>
        <span className="muted"> · 난이도 {DIFFICULTIES[game.difficulty].label}</span>
        {last && pos !== undefined && (
          <span className={pos <= game.objective ? 'obj-met' : 'obj-miss'}>
            {' '}— 지난 시즌 {pos}위 ({pos <= game.objective ? '목표 달성 ✓' : '목표 미달'})
          </span>
        )}
      </div>

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
            <p>
              최종 순위: <b>{pos}위</b> / {last.table.length}팀 &nbsp;·&nbsp;
              리그 우승: <b>{last.championName}</b>
              {last.cupChampionName && (
                <> &nbsp;·&nbsp; 컵 우승: <b>{last.cupChampionName}</b></>
              )}
              {last.youthPromotions !== undefined && last.youthPromotions > 0 && (
                <> &nbsp;·&nbsp; 🎓 유스 승격: <b>{last.youthPromotions}명</b></>
              )}
              {last.fireSales !== undefined && last.fireSales > 0 && (
                <> &nbsp;·&nbsp; <span className="neg">💸 재정 강제 매각: {last.fireSales}명</span></>
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

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
