/** 엔진 공개 API. */
export * from './types.js';
export { Rng } from './rng.js';
export { simulateMatch, MATCH_LENGTH, type MatchSetup } from './simulateMatch.js';
export { LiveMatch, HALF_TIME, type LiveStats } from './liveMatch.js';
export {
  matchWeather, WEATHER_LABEL, WEATHER_ATTACK_MULTIPLIER, WEATHER_CREATION_MULTIPLIER, type Weather,
} from './weather.js';
export {
  matchRefereeStrictness, REFEREE_STRICTNESS_LABEL, REFEREE_CARD_MULTIPLIER, type RefereeStrictness,
} from './referee.js';
export { computeTeamStrength, lineOf, formationMatchup, type FormationMatchup } from './teamStrength.js';
export {
  playerDerived, currentAbility, isInjured, isSuspended, isAvailable, familiarityAt,
  type DerivedRatings,
} from './derived.js';
export { applyMatchEffects, ROTATION_WARNING_THRESHOLD } from './matchEffects.js';
export { buildRotationWarningReport, type RotationWarningEntry } from './rotation.js';
export { decideAiHalftimeTactic, simulateMatchWithAiTactics } from './aiInMatch.js';
export {
  rollInjury, SEVERITY_LABEL, type Injury, type InjurySeverity, type BodyPart,
  REINJURY_RISK_WINDOW, RECOVERY_ATTR_WINDOW, reinjuryRiskFactor, fatigueRiskFactor,
  chronicInjuryFactor, CHRONIC_INJURY_FREE_COUNT,
  predictedInjuryRiskPerMatch, buildInjuryRiskReport, injuryRiskTier,
  buildInjuryRecoveryReport,
  type InjuryRiskTier, type InjuryRiskEntry, type InjuryRecoveryStatus,
} from './injury.js';
export {
  aggregatePlayerStats, topScorers, topAssists, playerOfSeason, seasonAwards, summarizeStats,
  careerScorers, recentPlayerForm, seasonSquadSnapshot, goldenGlove, bestXI, clubDisciplineTable,
  monthlyManagerAwards, monthlyPlayerAwards, motmTally, longestStreaks, biggestWinMargin,
  weatherRecordByClub,
  type PlayerSeasonStat, type SeasonAwards, type CareerStat, type PlayerFormEntry,
  type SeasonSquadEntry, type BestXIEntry, type ClubDisciplineRow, type MonthlyManagerAward,
  type MonthlyPlayerAward, type MotmTallyEntry, type StreakSummary, type BiggestWin,
  type WeatherRecordRow,
} from './stats.js';
export {
  generateClub, generateYouthPlayer, defaultTactic, FORMATION_433, type TacticContext,
  ACADEMY_FOCUS_WEIGHT_MULTIPLIER, ACADEMY_FOCUS_POTENTIAL_BONUS_PER_LEVEL,
} from './generate.js';
export { FORMATIONS, FORMATION_NAMES } from './formations.js';
export { simulateSeason, type SeasonResult } from './league.js';
export { doubleRoundRobin, type Fixture } from './schedule.js';
export {
  createSeasonState, isSeasonOver, totalRounds, currentRound,
  playNext, playRound, playToEnd, computeTable, commitResult, tacticFor, positionHistory,
  type SeasonState, type TableRow,
} from './season.js';
export { progressPlayer } from './progression.js';
export { TRAINING_FOCUSES, TRAINING_LABELS, TRAINING_FOCUS_ATTRS } from './training.js';
export {
  ALL_TRAITS, TRAIT_LABELS, TRAIT_DESC, hasTrait, rollTraits,
} from './traits.js';
export {
  advanceSeason, runFranchise, runOffseason, retireChance, RETIRE_MIN_AGE,
  assignMentor, clearMentorPairing, MENTOR_PAIRING_MAX, POSITION_MASTERY_MILESTONES,
  type SeasonSummary, type OffseasonResult, type RetiredLegend,
  type CareerMilestone, type MilestoneKind, type YouthProspect,
  type DebutEvent, type DebutEventKind, type YouthProspectUpdate, type LoanReturnEvent,
  type LoanObligationEvent, type ReservePromotionEvent, type MentorAssignResult, type AddOnEvent,
  type AcademyAlumnusUpdate, type MentorGraduationEvent, type MentorGraduationReason,
  type BoardPersonaChangeEvent,
} from './franchise.js';
export { TUNING } from './tuning.js';
export { DERIVED_WEIGHTS, type DerivedKey } from './roleWeights.js';
export { formatMoney, EOK } from './money.js';
export {
  marketValue, weeklyWage, agentFee,
  loyaltyTier, loyaltyDiscount,
  LOYALTY_TRUSTED_SEASONS, LOYALTY_LEGEND_SEASONS, LOYALTY_MAX_DISCOUNT,
  type LoyaltyTier,
} from './valuation.js';
export {
  settleSeason, leaguePrize, attendanceFormFactor, RIVAL_MATCHDAY_PREMIUM,
  generateSponsorGoal, evaluateSponsorGoal, SPONSOR_GOAL_LABEL, sponsorStreakMultiplier,
  STADIUM_MAX, stadiumMatchdayMultiplier, stadiumUpgradeCost, upgradeStadium,
  ACADEMY_MAX, academyPotentialBonus, academyUpgradeCost, upgradeAcademy,
  TRAINING_GROUND_MAX, trainingGroundInjuryFactor, trainingGroundUpgradeCost, upgradeTrainingGround,
  SPONSOR_CONTRACT_LABEL, SPONSOR_CONTRACT_LENGTH_SEASONS, SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER,
  SPONSOR_CONTRACT_STADIUM_MIN_LEVEL, sponsorContractPayout, signSponsorContract, tickSponsorContracts,
  TICKET_PRICE_MATCHDAY_MULTIPLIER, FAN_PROTEST_MATCHDAY_PENALTY, FAN_SATISFACTION_DEFAULT,
  FAN_PROTEST_THRESHOLD, fanSatisfactionDelta, updateFanSatisfaction, setTicketPriceTier,
  type SeasonFinanceReport, type SponsorGoal, type SponsorGoalKind, type SponsorGoalResult,
  type StadiumUpgradeResult, type AcademyUpgradeResult, type TrainingGroundUpgradeResult,
  type SponsorContract, type SponsorContractKind, type SponsorContractSignResult, type SponsorContractTickResult,
  type FanSatisfactionInput, type FanSatisfactionResult,
} from './finance.js';
export { runTransferWindow, AI_MAX_DEALS_PER_CLUB, type TransferDeal } from './transfer.js';
export {
  createCup, playCupRound, playCupToEnd, isCupOver, cupSurvivors, nextCupPairings,
  CUP_FINAL_ROUND_NAME, CUP_SEMIFINAL_ROUND_NAME, CUP_UPSET_REP_GAP, findCupUpsets, cupTieAggregate,
  type CupState, type CupRound, type CupTie, type CupPairing, type NextCupRound, type CupUpsetEvent,
} from './cup.js';
export {
  applyPromotionRelegation, clubsInDivision, type PromRelResult,
} from './promotion.js';
export {
  recentForm, type FormResult, type FormSummary,
} from './form.js';
export {
  selectCallUps, runInternationalBreak, runInternationalTournament, TOURNAMENT_INTERVAL_SEASONS,
  checkInternationalRetirements, internationalRetireChance, INTL_RETIRE_MIN_AGE, INTL_RETIRE_MIN_CAPS,
  clubTournamentHighlight,
  type CallUp, type InternationalResult, type InternationalTournamentResult,
  type TournamentRound, type TournamentTie, type InternationalRetirementEvent,
  type ClubTournamentHighlight,
} from './international.js';
export {
  START_CONFIDENCE, SACK_THRESHOLD, confidenceDelta, applyConfidence,
  boardStatus, isSacked, boardTierUpgradeBonus,
  BOLD_PREDICTION_MARGIN, BOLD_PREDICTION_BONUS_CONFIDENCE, BOLD_PREDICTION_PENALTY_CONFIDENCE,
  boldPredictionTarget, evaluateBoldPrediction,
  BOARD_PERSONA_CHANGE_CHANCE, maybeChangeBoardPersona,
  LONG_TERM_PROJECT_MILESTONES, crossedLongTermProjectMilestone, longTermProjectBonus,
  type SeasonConfidenceInput, type BoardStatus, type BoldPredictionResult,
} from './board.js';
export {
  DEMAND_LABEL, generateDemand, evaluateDemand, demandConfidence,
  renegotiateDemand, RENEGOTIATE_BASE_COST, RENEGOTIATE_IMPATIENT_REFUSE_CHANCE, RENEGOTIATE_REDUCTION,
  type DemandKind, type BoardDemand, type DemandContext, type DemandResult, type RenegotiateResult,
} from './demands.js';
export {
  transferTargets, buyPlayer, buyPlayerAt, buyPlayerViaReleaseClause, sellPlayer, releasePlayer,
  askingPrice, evaluateOffer, sellOffers, acceptSellOffer,
  loanPlayerOut, recallLoanPlayer, applyLoanWageSubsidies, swapPlayers, agentPersonality,
  exerciseBuyback, BUYBACK_MAX_SEASONS, attachAddOnClause, exerciseLoanBuyOption,
  ADD_ON_MAX_TIERS, ADD_ON_CONDITION_LABEL, addOnConditionValue,
  agentRelationsOf, agentRelationsTier,
  applyNegotiationBreakdownPenalty, decayAgentRelations, AGENT_RELATIONS_DECAY_RATIO,
  AGENT_RELATIONS_MIN, AGENT_RELATIONS_MAX, AGENT_RELATIONS_DEFAULT, AGENT_RELATIONS_BREAKDOWN_PENALTY,
  panicBuy, PANIC_BUY_PREMIUM, executeRivalSnipe,
  MIN_SQUAD, MAX_SQUAD, MAX_NEGOTIATION_ROUNDS, LOAN_MIN_SEASONS, LOAN_MAX_SEASONS,
  LOAN_OBLIGATION_MIN_APPS, LOAN_OBLIGATION_MAX_APPS,
  renegotiateLoanWageShare, LOAN_WAGE_RENEGOTIATION_STEP,
  LOAN_WAGE_LOW_APPS_THRESHOLD, LOAN_WAGE_HIGH_APPS_THRESHOLD,
  renegotiateBuybackClause, BUYBACK_RENEGOTIATION_STEP,
  BUYBACK_VALUE_INCREASE_RATIO, BUYBACK_VALUE_DECREASE_RATIO,
  type TransferTarget, type BuyResult, type SellResult,
  type OfferOutcome, type OfferEvaluation, type SellOffer,
  type LoanTerms, type LoanResult, type SwapResult, type AgentPersonality, type BuybackResult,
  type AddOnAttachResult, type LoanBuyOptionResult, type AgentRelationsTier, type RivalSnipeResult,
  type LoanWageRenegotiationDirection, type LoanWageRenegotiationResult,
  type BuybackRenegotiationDirection, type BuybackRenegotiationResult,
} from './transferActions.js';
export {
  upgradeStaff, upgradeCost, STAFF_KINDS, STAFF_MAX,
  SPECIALIST_COACH_KINDS, NAMED_STAFF_KINDS, specialistCoachLevel, effectiveCoaching,
  effectiveMedical, effectiveScouting, effectiveYouth, effectiveReserveCoaching, staffTraitSynergyBonus,
  STAFF_TRAIT_LABEL, STAFF_TRAIT_DESC, STAFF_TRAIT_BONUS,
  STAFF_TRAIT_TIER_BONUS, STAFF_TRAIT_TIER_LABEL,
  negotiateStaffRaise, staffRaiseCost, STAFF_RAISE_ELIGIBLE_YEARS, STAFF_RAISE_EXTENSION_YEARS,
  staffRetireChance, STAFF_RETIRE_MIN_AGE, STAFF_RETIRE_HARD_AGE,
  poachStaff, staffMarketValue,
  type StaffKind, type UpgradeResult, type SpecialistCoachKind, type NamedStaffKind,
  type StaffDepartureEvent, type StaffRaiseResult, type StaffRetirementEvent, type StaffPoachResult,
} from './staffActions.js';
export {
  enforceFinancialFairPlay, inFinancialCrisis, wageBudget, annualWageBill,
  applyFinancialControl,
  type FireSaleResult, type FfpStage, type FinancialControlResult,
} from './financeControl.js';
export {
  buildScoutingReport, academyNationPool, scoutDispatchCost, dispatchScout,
  type ScoutingReport, type OverallTier, type PotentialTier, type AgeProfile, type ScoutDispatchResult,
} from './scouting.js';
export {
  matchOutcomeKind, mediaToneOptions, shouldTriggerMediaEvent, applyMediaTone,
  MEDIA_TONE_STYLE, classifyPersona, snsReputation, SNS_BASE_FOLLOWERS,
  type MediaEventKind, type MediaTone, type MediaToneOption, type MediaStyle, type ManagerPersona,
  type SnsReputation,
} from './media.js';
export {
  eligibleInstructionKinds, isValidInstruction, findManMarker,
  manMarkWeightMultiplier, manMarkXgMultiplier,
  MAN_MARK_POSITIONS, CUT_INSIDE_POSITIONS, CUT_INSIDE_WEIGHT_MUL, CUT_INSIDE_XG_MUL,
  type PlayerInstruction, type PlayerInstructionKind,
} from './playerInstructions.js';
export {
  simulateReserveSeason, MIN_RESERVE_SQUAD, RESERVE_LEAGUE_CHAMPION_MORALE_BOOST,
  type ReserveTableRow, type ReserveLeagueResult,
} from './reserveLeague.js';
export { captainScore, rankCaptainCandidates, type CaptainCandidate } from './captaincy.js';
