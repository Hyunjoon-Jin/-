import { describe, it, expect } from 'vitest';
import {
  settleSeason, fanSatisfactionDelta, updateFanSatisfaction, setTicketPriceTier,
  FAN_SATISFACTION_DEFAULT, FAN_PROTEST_THRESHOLD, TICKET_PRICE_MATCHDAY_MULTIPLIER,
} from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('고도화 Item18: 팬 만족도 미터', () => {
  it('티켓가가 높을수록 매치데이 수익 배율이 크다', () => {
    expect(TICKET_PRICE_MATCHDAY_MULTIPLIER.high).toBeGreaterThan(TICKET_PRICE_MATCHDAY_MULTIPLIER.normal);
    expect(TICKET_PRICE_MATCHDAY_MULTIPLIER.normal).toBeGreaterThan(TICKET_PRICE_MATCHDAY_MULTIPLIER.low);
  });

  it('티켓가를 지정하지 않으면(정상가) 기존과 완전히 동일한 매치데이 수익이 나온다(하위 호환)', () => {
    const withDefault = makeClub(1);
    const withNormal = makeClub(1);
    setTicketPriceTier(withNormal, 'normal');
    const a = settleSeason(withDefault, 3, 16);
    const b = settleSeason(withNormal, 3, 16);
    expect(a.income.matchday).toBe(b.income.matchday);
  });

  it('티켓가를 높이면 매치데이 수익이 늘고, 낮추면 줄어든다', () => {
    const low = makeClub(2);
    const normal = makeClub(2);
    const high = makeClub(2);
    setTicketPriceTier(low, 'low');
    setTicketPriceTier(high, 'high');
    const lowReport = settleSeason(low, 3, 16);
    const normalReport = settleSeason(normal, 3, 16);
    const highReport = settleSeason(high, 3, 16);
    expect(highReport.income.matchday).toBeGreaterThan(normalReport.income.matchday);
    expect(normalReport.income.matchday).toBeGreaterThan(lowReport.income.matchday);
  });

  it('목표 초과 성적·저가 티켓·신규 영입은 팬 만족도를 올린다', () => {
    const delta = fanSatisfactionDelta({ performanceDelta: 5, ticketPriceTier: 'low', newSignings: 2 });
    expect(delta).toBeGreaterThan(0);
  });

  it('목표 미달 성적·고가 티켓은 팬 만족도를 깎는다', () => {
    const delta = fanSatisfactionDelta({ performanceDelta: -5, ticketPriceTier: 'high', newSignings: 0 });
    expect(delta).toBeLessThan(0);
  });

  it('updateFanSatisfaction은 club.finance.fanSatisfaction을 실제로 갱신한다', () => {
    const club = makeClub(3);
    const result = updateFanSatisfaction(club, { performanceDelta: 3, ticketPriceTier: 'normal', newSignings: 1 });
    expect(club.finance.fanSatisfaction).toBe(result.fanSatisfaction);
    expect(result.fanSatisfaction).toBe(FAN_SATISFACTION_DEFAULT + result.delta);
  });

  it('만족도가 문턱 미만으로 떨어지면 시위(protest)가 발생하고 fanProtestActive가 켜진다', () => {
    const club = makeClub(4);
    club.finance.fanSatisfaction = FAN_PROTEST_THRESHOLD + 2;
    const result = updateFanSatisfaction(club, { performanceDelta: -10, ticketPriceTier: 'high', newSignings: 0 });
    expect(result.protest).toBe(true);
    expect(club.finance.fanProtestActive).toBe(true);
  });

  it('시위가 발생한 다음 시즌 정산에서는 매치데이 수익에 페널티가 한 번 적용되고, 그 다음엔 정상으로 돌아온다', () => {
    const clubA = makeClub(5);
    const clubB = makeClub(5);
    clubA.finance.fanProtestActive = true;
    const withProtest = settleSeason(clubA, 3, 16);
    const withoutProtest = settleSeason(clubB, 3, 16);
    expect(withProtest.income.matchday).toBeLessThan(withoutProtest.income.matchday);
    expect(clubA.finance.fanProtestActive).toBe(false); // 한 번 적용되고 자동으로 꺼짐
    const nextSeason = settleSeason(clubA, 3, 16);
    expect(nextSeason.income.matchday).toBe(withoutProtest.income.matchday);
  });

  it('만족도는 0~100 범위를 벗어나지 않는다', () => {
    const club = makeClub(6);
    club.finance.fanSatisfaction = 2;
    const result = updateFanSatisfaction(club, { performanceDelta: -20, ticketPriceTier: 'high', newSignings: 0 });
    expect(result.fanSatisfaction).toBeGreaterThanOrEqual(0);
  });
});
