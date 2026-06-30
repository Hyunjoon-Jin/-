/** 엔진 공개 API. */
export * from './types.js';
export { Rng } from './rng.js';
export { simulateMatch, MATCH_LENGTH, type MatchSetup } from './simulateMatch.js';
export { LiveMatch, HALF_TIME } from './liveMatch.js';
export { computeTeamStrength, lineOf } from './teamStrength.js';
export { playerDerived, currentAbility, isInjured, type DerivedRatings } from './derived.js';
export { applyMatchEffects } from './matchEffects.js';
export { generateClub, generateYouthPlayer, defaultTactic, FORMATION_433 } from './generate.js';
export { simulateSeason, type SeasonResult } from './league.js';
export { doubleRoundRobin, type Fixture } from './schedule.js';
export {
  createSeasonState, isSeasonOver, totalRounds, currentRound,
  playNext, playRound, playToEnd, computeTable, commitResult,
  type SeasonState, type TableRow,
} from './season.js';
export { progressPlayer } from './progression.js';
export {
  advanceSeason, runFranchise, runOffseason, type SeasonSummary,
} from './franchise.js';
export { TUNING } from './tuning.js';
export { DERIVED_WEIGHTS, type DerivedKey } from './roleWeights.js';
export { formatMoney, EOK } from './money.js';
export { marketValue, weeklyWage } from './valuation.js';
export { settleSeason, leaguePrize, type SeasonFinanceReport } from './finance.js';
export { runTransferWindow, type TransferDeal } from './transfer.js';
export {
  transferTargets, buyPlayer, sellPlayer, releasePlayer,
  MIN_SQUAD, MAX_SQUAD,
  type TransferTarget, type BuyResult, type SellResult,
} from './transferActions.js';
