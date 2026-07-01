/** 엔진 공개 API. */
export * from './types.js';
export { Rng } from './rng.js';
export { simulateMatch, MATCH_LENGTH, type MatchSetup } from './simulateMatch.js';
export { LiveMatch, HALF_TIME, type LiveStats } from './liveMatch.js';
export { computeTeamStrength, lineOf } from './teamStrength.js';
export {
  playerDerived, currentAbility, isInjured, isSuspended, isAvailable,
  type DerivedRatings,
} from './derived.js';
export { applyMatchEffects } from './matchEffects.js';
export {
  aggregatePlayerStats, topScorers, playerOfSeason, seasonAwards, summarizeStats,
  type PlayerSeasonStat, type SeasonAwards,
} from './stats.js';
export { generateClub, generateYouthPlayer, defaultTactic, FORMATION_433 } from './generate.js';
export { simulateSeason, type SeasonResult } from './league.js';
export { doubleRoundRobin, type Fixture } from './schedule.js';
export {
  createSeasonState, isSeasonOver, totalRounds, currentRound,
  playNext, playRound, playToEnd, computeTable, commitResult,
  type SeasonState, type TableRow,
} from './season.js';
export { progressPlayer } from './progression.js';
export { TRAINING_FOCUSES, TRAINING_LABELS, TRAINING_FOCUS_ATTRS } from './training.js';
export {
  ALL_TRAITS, TRAIT_LABELS, TRAIT_DESC, hasTrait, rollTraits,
} from './traits.js';
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
  createCup, playCupRound, playCupToEnd, isCupOver, cupSurvivors,
  type CupState, type CupRound, type CupTie,
} from './cup.js';
export {
  applyPromotionRelegation, clubsInDivision, type PromRelResult,
} from './promotion.js';
export {
  recentForm, type FormResult, type FormSummary,
} from './form.js';
export {
  selectCallUps, runInternationalBreak,
  type CallUp, type InternationalResult,
} from './international.js';
export {
  transferTargets, buyPlayer, buyPlayerAt, sellPlayer, releasePlayer,
  askingPrice, evaluateOffer,
  MIN_SQUAD, MAX_SQUAD,
  type TransferTarget, type BuyResult, type SellResult,
  type OfferOutcome, type OfferEvaluation,
} from './transferActions.js';
export {
  upgradeStaff, upgradeCost, STAFF_KINDS, STAFF_MAX,
  type StaffKind, type UpgradeResult,
} from './staffActions.js';
export {
  enforceFinancialFairPlay, inFinancialCrisis, wageBudget, annualWageBill,
  type FireSaleResult,
} from './financeControl.js';
