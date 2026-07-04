/**
 * 역대 기록집 — 내 구단의 진행 중인 재임(state.history) 전체를 스캔해 개인·구단
 * 기록을 산출한다. career.ts(재임 간 아카이브)와 달리 이번 재임 안에서만 유효하며,
 * 새로운 상태를 저장하지 않고 이미 쌓인 SeasonSummary[]에서 매번 다시 계산한다.
 */
import type { GameState } from './game.js';
import { formatMoney } from '@soccer-tycoon/engine';

export interface ClubRecordEntry {
  label: string;
  holder: string;
  detail: string;
  season: number;
}

export interface ClubRecords {
  mostGoalsSeason?: ClubRecordEntry;
  mostAssistsSeason?: ClubRecordEntry;
  bestAvgRatingSeason?: ClubRecordEntry;
  bestFinish?: ClubRecordEntry;
  mostPointsSeason?: ClubRecordEntry;
  bestNetIncomeSeason?: ClubRecordEntry;
}

/** 내 구단 역대 기록 산출(진행 중인 재임 한정). */
export function computeClubRecords(game: GameState): ClubRecords {
  const myId = game.myClubId;

  let mostGoals: { goals: number; name: string; season: number } | null = null;
  let mostAssists: { assists: number; name: string; season: number } | null = null;
  let bestRating: { avgRating: number; name: string; season: number } | null = null;
  let bestFinish: { position: number; clubName: string; season: number } | null = null;
  let mostPoints: { points: number; clubName: string; season: number } | null = null;
  let bestNet: { net: number; clubName: string; season: number } | null = null;

  for (const s of game.history) {
    for (const p of s.squad ?? []) {
      if (p.goals > 0 && (!mostGoals || p.goals > mostGoals.goals)) {
        mostGoals = { goals: p.goals, name: p.name, season: s.season };
      }
      if (p.assists > 0 && (!mostAssists || p.assists > mostAssists.assists)) {
        mostAssists = { assists: p.assists, name: p.name, season: s.season };
      }
      if (p.avgRating > 0 && (!bestRating || p.avgRating > bestRating.avgRating)) {
        bestRating = { avgRating: p.avgRating, name: p.name, season: s.season };
      }
    }
    const myRow = s.table.find((r) => r.clubId === myId);
    if (myRow) {
      const position = s.table.findIndex((r) => r.clubId === myId) + 1;
      if (!bestFinish || position < bestFinish.position) {
        bestFinish = { position, clubName: myRow.name, season: s.season };
      }
      if (!mostPoints || myRow.points > mostPoints.points) {
        mostPoints = { points: myRow.points, clubName: myRow.name, season: s.season };
      }
    }
    const net = s.finance.get(myId)?.net;
    if (net !== undefined && (!bestNet || net > bestNet.net)) {
      bestNet = { net, clubName: myRow?.name ?? '', season: s.season };
    }
  }

  return {
    mostGoalsSeason: mostGoals
      ? { label: '한 시즌 최다골(개인)', holder: mostGoals.name, detail: `${mostGoals.goals}골`, season: mostGoals.season }
      : undefined,
    mostAssistsSeason: mostAssists
      ? { label: '한 시즌 최다 도움(개인)', holder: mostAssists.name, detail: `${mostAssists.assists}도움`, season: mostAssists.season }
      : undefined,
    bestAvgRatingSeason: bestRating
      ? { label: '한 시즌 최고 평균 평점', holder: bestRating.name, detail: bestRating.avgRating.toFixed(2), season: bestRating.season }
      : undefined,
    bestFinish: bestFinish
      ? { label: '역대 최고 순위', holder: bestFinish.clubName, detail: `${bestFinish.position}위`, season: bestFinish.season }
      : undefined,
    mostPointsSeason: mostPoints
      ? { label: '한 시즌 최다 승점', holder: mostPoints.clubName, detail: `${mostPoints.points}점`, season: mostPoints.season }
      : undefined,
    bestNetIncomeSeason: bestNet
      ? { label: '한 시즌 최대 순수익', holder: bestNet.clubName, detail: formatMoney(bestNet.net), season: bestNet.season }
      : undefined,
  };
}
