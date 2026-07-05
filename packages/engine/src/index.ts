/** 엔진 공개 API. */
export * from './types.js';
export { Rng } from './rng.js';
export { simulateMatch, MATCH_LENGTH, type MatchSetup } from './simulateMatch.js';
export { LiveMatch, HALF_TIME, type LiveStats } from './liveMatch.js';
export { computeTeamStrength, lineOf, formationMatchup, type FormationMatchup } from './teamStrength.js';
export {
  playerDerived, currentAbility, isInjured, isSuspended, isAvailable, familiarityAt,
  type DerivedRatings,
} from './derived.js';
export { applyMatchEffects } from './matchEffects.js';
export { decideAiHalftimeTactic, simulateMatchWithAiTactics } from './aiInMatch.js';
export {
  rollInjury, SEVERITY_LABEL, type Injury, type InjurySeverity, type BodyPart,
  REINJURY_RISK_WINDOW, RECOVERY_ATTR_WINDOW, reinjuryRiskFactor,
} from './injury.js';
export {
  aggregatePlayerStats, topScorers, topAssists, playerOfSeason, seasonAwards, summarizeStats,
  careerScorers, recentPlayerForm, seasonSquadSnapshot, goldenGlove, bestXI,
  type PlayerSeasonStat, type SeasonAwards, type CareerStat, type PlayerFormEntry,
  type SeasonSquadEntry, type BestXIEntry,
} from './stats.js';
export {
  generateClub, generateYouthPlayer, defaultTactic, FORMATION_433, type TacticContext,
} from './generate.js';
export { FORMATIONS, FORMATION_NAMES } from './formations.js';
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
  advanceSeason, runFranchise, runOffseason, retireChance, RETIRE_MIN_AGE,
  type SeasonSummary, type OffseasonResult, type RetiredLegend,
  type CareerMilestone, type MilestoneKind, type YouthProspect,
  type DebutEvent, type DebutEventKind, type YouthProspectUpdate, type LoanReturnEvent,
} from './franchise.js';
export { TUNING } from './tuning.js';
export { DERIVED_WEIGHTS, type DerivedKey } from './roleWeights.js';
export { formatMoney, EOK } from './money.js';
export { marketValue, weeklyWage, agentFee } from './valuation.js';
export {
  settleSeason, leaguePrize, attendanceFormFactor,
  generateSponsorGoal, evaluateSponsorGoal, SPONSOR_GOAL_LABEL,
  type SeasonFinanceReport, type SponsorGoal, type SponsorGoalKind, type SponsorGoalResult,
} from './finance.js';
export { runTransferWindow, type TransferDeal } from './transfer.js';
export {
  createCup, playCupRound, playCupToEnd, isCupOver, cupSurvivors, nextCupPairings,
  CUP_FINAL_ROUND_NAME,
  type CupState, type CupRound, type CupTie, type CupPairing, type NextCupRound,
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
  START_CONFIDENCE, SACK_THRESHOLD, confidenceDelta, applyConfidence,
  boardStatus, isSacked,
  type SeasonConfidenceInput, type BoardStatus,
} from './board.js';
export {
  DEMAND_LABEL, generateDemand, evaluateDemand, demandConfidence,
  type DemandKind, type BoardDemand, type DemandContext, type DemandResult,
} from './demands.js';
export {
  transferTargets, buyPlayer, buyPlayerAt, buyPlayerViaReleaseClause, sellPlayer, releasePlayer,
  askingPrice, evaluateOffer, sellOffers, acceptSellOffer,
  loanPlayerOut, recallLoanPlayer, applyLoanWageSubsidies,
  MIN_SQUAD, MAX_SQUAD, MAX_NEGOTIATION_ROUNDS, LOAN_MIN_SEASONS, LOAN_MAX_SEASONS,
  type TransferTarget, type BuyResult, type SellResult,
  type OfferOutcome, type OfferEvaluation, type SellOffer,
  type LoanTerms, type LoanResult,
} from './transferActions.js';
export {
  upgradeStaff, upgradeCost, STAFF_KINDS, STAFF_MAX,
  SPECIALIST_COACH_KINDS, NAMED_STAFF_KINDS, specialistCoachLevel, effectiveCoaching,
  effectiveMedical, effectiveScouting, effectiveYouth,
  STAFF_TRAIT_LABEL, STAFF_TRAIT_DESC, STAFF_TRAIT_BONUS,
  type StaffKind, type UpgradeResult, type SpecialistCoachKind, type NamedStaffKind,
} from './staffActions.js';
export {
  enforceFinancialFairPlay, inFinancialCrisis, wageBudget, annualWageBill,
  type FireSaleResult,
} from './financeControl.js';
export {
  buildScoutingReport, academyNationPool,
  type ScoutingReport, type OverallTier, type PotentialTier, type AgeProfile,
} from './scouting.js';
export {
  matchOutcomeKind, mediaToneOptions, shouldTriggerMediaEvent, applyMediaTone,
  MEDIA_TONE_STYLE, classifyPersona,
  type MediaEventKind, type MediaTone, type MediaToneOption, type MediaStyle, type ManagerPersona,
} from './media.js';
