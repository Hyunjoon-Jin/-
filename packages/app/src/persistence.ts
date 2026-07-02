/**
 * 세이브 직렬화 (저장소 독립).
 * GameState ↔ 순수 JSON(SaveFile) 변환. 버전 필드로 마이그레이션 대비.
 *
 * 핵심: SeasonSummary.finance 는 Map<string, ...> 이라 JSON.stringify 로
 * 직렬화되지 않는다 → 저장 시 객체로, 로드 시 Map 으로 변환한다.
 * 이 포맷은 저장소(localStorage / 추후 Electron SQLite)와 무관하게 동일.
 */
import type { GameState } from './game.js';
import type { SeasonSummary, SeasonFinanceReport } from '@soccer-tycoon/engine';

// v2~v12 …, v13: 승강제/다중 리그(Club.division, live.divisionClubIds)
// v14: 선수 고유 특성(Player.traits)
// v15: 국가대표 A매치 캡(Player.caps) + 시즌 요약 차출 정보
// v16: 이사회 신뢰도(boardConfidence) + 경질(sacked)
// v17: 선수 통산/시즌 득점(seasonGoals·careerApps·careerGoals)
// v18: 이사회 특별 요구(demand)
// v19: 선수 CA 성장 곡선(caHistory)
// v20: 부상 등급/명칭(injuryName)
// v21: 시즌 스쿼드 스냅샷(SeasonSummary.squad)
// v22: 경기 중 부상 판정(MatchResult.injuries) — 진행 중 시즌의 live.results에 포함
// v23: 은퇴 선수 레전드 아카이브(GameState.legends)
// v24: 통산 마일스톤(SeasonSummary.milestones)
// v25: 라이벌 구단(GameState.rivalClubId·rivalRecord)
// v26: 미디어 인터뷰 처리 라운드 추적(LiveSeason.mediaHandledThroughRound)
// v27: 라이벌전 개별 맞대결 기록(GameState.rivalMeetings)
// v28: 프리시즌 언론 예상 순위(LiveSeason.predictedTable, SeasonSummary.preseasonRank·surprise)
export const SAVE_VERSION = 28;

type SerializedSummary = Omit<SeasonSummary, 'finance'> & {
  finance: Record<string, SeasonFinanceReport>;
};

export interface SerializedGameState extends Omit<GameState, 'history'> {
  history: SerializedSummary[];
}

export interface SaveFile {
  version: number;
  savedAt: string;
  state: SerializedGameState;
}

export function serialize(state: GameState): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      ...state,
      history: state.history.map((s) => ({
        ...s,
        finance: Object.fromEntries(s.finance),
      })),
    },
  };
}

export function deserialize(file: SaveFile): GameState {
  if (file.version !== SAVE_VERSION) {
    throw new Error(`지원하지 않는 세이브 버전: ${file.version} (현재 ${SAVE_VERSION})`);
  }
  return {
    ...file.state,
    history: file.state.history.map((s) => ({
      ...s,
      finance: new Map(Object.entries(s.finance)),
    })),
  };
}
