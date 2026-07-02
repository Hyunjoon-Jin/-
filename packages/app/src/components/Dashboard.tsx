import {
  myClub, rivalClub, lastSummary, myLastPosition, managerPersona, contractOptions,
  DIFFICULTIES, DIVISION_LABELS, type GameState,
} from '../game.js';
import {
  formatMoney, currentAbility, wageBudget, annualWageBill, inFinancialCrisis,
  boardStatus, DEMAND_LABEL, type BoardStatus, type ManagerPersona,
} from '@soccer-tycoon/engine';

const BOARD_LABEL: Record<BoardStatus, string> = {
  secure: '신뢰 두터움', stable: '안정적', shaky: '불안', critical: '경질 위기',
};

const PERSONA_LABEL: Record<Exclude<ManagerPersona, 'neutral'>, { label: string; desc: string }> = {
  bold: { label: '거침없는 승부사', desc: '자신감 있고 직설적인 인터뷰로 유명합니다.' },
  humble: { label: '신중한 리더', desc: '겸손하고 책임감 있는 인터뷰로 신뢰를 얻고 있습니다.' },
};

export function Dashboard({ game, onSignContract }: { game: GameState; onSignContract: (years: number) => void }) {
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

      <div className="rival-card">
        🔥 라이벌: <b>{rival.name}</b>
        <span className="muted"> ({DIVISION_LABELS[rival.division]})</span>
        <span className="rival-record">
          {' '}— 통산 {game.rivalRecord.wins}승 {game.rivalRecord.draws}무 {game.rivalRecord.losses}패
        </span>
        {game.rivalMeetings.length > 0 && (
          <span className="rival-form">
            {' '}
            {game.rivalMeetings.slice(-5).map((m, i) => (
              <span key={i} className={`form-dot ${m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}`}>
                {m.result === 'win' ? '승' : m.result === 'loss' ? '패' : '무'}
              </span>
            ))}
          </span>
        )}
      </div>

      {persona !== 'neutral' && (
        <div className="persona-card">
          🗣️ 언론이 부르는 별명: <b>{PERSONA_LABEL[persona].label}</b>
          <span className="muted"> — {PERSONA_LABEL[persona].desc}</span>
        </div>
      )}

      {contract && (
        <div className="contract-offer">
          <h3>📝 감독 계약 만료 — 갱신 제안</h3>
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
        </div>
      )}

      <BoardConfidence value={game.boardConfidence} />

      {game.demand && (
        <div className="board-demand">
          📋 이사회 특별 요구: <b>{DEMAND_LABEL[game.demand.kind]}</b>
          <span className="muted small"> (달성 시 신뢰도 +{game.demand.reward} · 실패 시 −{game.demand.penalty})</span>
        </div>
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
            {retiredThisSeason.length > 0 && (
              <div className="retirement-banner">
                {retiredThisSeason.map((l) => (
                  <p key={l.playerId}>
                    🕯️ <b>{l.name}</b>({l.position})이(가) {l.finalAge}세로 은퇴했습니다 — 통산{' '}
                    <b>{l.careerApps}경기</b>
                    {l.careerGoals > 0 && <> <b>{l.careerGoals}골</b></>}
                    {l.caps > 0 && <span className="muted"> · A매치 {l.caps}경</span>}.
                    그동안 수고했습니다.
                  </p>
                ))}
              </div>
            )}
            {last.milestones !== undefined && last.milestones.length > 0 && (
              <div className="milestone-banner">
                {last.milestones.map((m, i) => (
                  <p key={i}>
                    🎉 <b>{m.name}</b>, 통산 <b>{m.value}{m.kind === 'apps' ? '경기 출전' : '골'}</b> 달성!
                  </p>
                ))}
              </div>
            )}
            {last.youthProspects !== undefined && last.youthProspects.length > 0 && (
              <div className="youth-banner">
                <p className="youth-banner-title">🌱 이번 시즌 유스 기대주</p>
                {last.youthProspects.map((p) => (
                  <p key={p.playerId}>
                    <b>{p.name}</b> ({p.position} · {p.age}세) — 잠재력 <b>{p.potential.toFixed(0)}</b>
                  </p>
                ))}
              </div>
            )}
            {last.prospectUpdates !== undefined && last.prospectUpdates.length > 0 && (
              <div className="prospect-update-banner">
                <p className="prospect-update-banner-title">📣 유스 기대주 소식</p>
                {last.prospectUpdates.map((u, i) => (
                  <p key={i}>
                    {u.kind === 'debut'
                      ? <>유스 기대주 출신 <b>{u.name}</b>, 1군 <b>데뷔</b>에 성공했습니다!</>
                      : <>유스 기대주 출신 <b>{u.name}</b>, 커리어 <b>첫 골</b>을 기록했습니다!</>}
                  </p>
                ))}
              </div>
            )}
            {last.surprise && (
              <div className={`surprise-banner ${last.surprise}`}>
                <p>
                  {last.surprise === 'overperform'
                    ? <>🎉 <b>이변의 시즌!</b> 언론은 {last.preseasonRank}위로 예상했지만 <b>{pos}위</b>로 마쳤습니다.</>
                    : <>😞 <b>실망스러운 시즌.</b> 언론은 {last.preseasonRank}위를 예상했지만 <b>{pos}위</b>에 그쳤습니다.</>}
                </p>
              </div>
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
        <span>🏛 이사회 신뢰도</span>
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
