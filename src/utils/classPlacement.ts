import { ClassAnalytics, Student, StudentMetrics, SurveyResponse } from '../types';
import { detectFriendClusters, FriendCluster } from './sociometry';

export type PlacementStrategyId =
  | 'balanced'
  | 'conflict_first'
  | 'safe_base'
  | 'clique_disperse';

export interface PlacementWeights {
  conflictSeparation: number;  // 0-100: 갈등·불편 관계 분리 (Coie & Dodge; Ladd)
  safeBaseSupport: number;     // 0-100: 정서적 안전기지·지지 친구 확보 (Bowlby; Ladd)
  cliqueDispersal: number;     // 0-100: 배타적 소집단·파벌 분산 (Gest & Rodkin)
  leadershipBalance: number;   // 0-100: 친사회적 리더·가교 학생 균등 배치
  demographicBalance: number;  // 0-100: 인원·성별·관심학생 균형
}

export interface StrategyPreset {
  id: PlacementStrategyId;
  label: string;
  shortDesc: string;
  rationale: string;
  weights: PlacementWeights;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'balanced',
    label: '균형 표준형 (권장)',
    shortDesc: '갈등 분리 · 안전기지 · 균형 종합',
    rationale:
      '갈등 관계(-1/-2)를 최우선으로 분리하고, 고립·관심 학생에게 최소 1명의 정서적 안전기지(지지 친구)를 보장하며, 과밀 파벌 분산과 학급 간 성비·리더십 균형을 고르게 맞춥니다.',
    weights: {
      conflictSeparation: 95,
      safeBaseSupport: 85,
      cliqueDispersal: 65,
      leadershipBalance: 75,
      demographicBalance: 85,
    },
  },
  {
    id: 'conflict_first',
    label: '갈등 분리 최우선',
    shortDesc: '불편·어색 쌍 완전 분리 집중',
    rationale:
      '학교폭력 예방 및 정서적 안전 확보를 최우선 목표로 삼아, 상호·단방향 갈등 쌍(-2, -1)과 갈등·주의형 학생을 서로 다른 학급에 배치하는 데 가장 높은 가중치를 둡니다.',
    weights: {
      conflictSeparation: 100,
      safeBaseSupport: 65,
      cliqueDispersal: 55,
      leadershipBalance: 65,
      demographicBalance: 75,
    },
  },
  {
    id: 'safe_base',
    label: '정서적 안전기지 우선',
    shortDesc: '고립·소속감 저하 학생 적응 지원',
    rationale:
      '새 학기 학급 전환 불안을 줄이기 위해(Ladd의 전환기 지지 이론), 소속감이 낮거나 고립 위험이 있는 학생이 신뢰할 수 있는 친구 또는 가교 학생과 같은 반에 배정되도록 우선 보호합니다.',
    weights: {
      conflictSeparation: 85,
      safeBaseSupport: 100,
      cliqueDispersal: 45,
      leadershipBalance: 70,
      demographicBalance: 75,
    },
  },
  {
    id: 'clique_disperse',
    label: '파벌 분산 · 새 출발',
    shortDesc: '배타적 또래 집단 재구성',
    rationale:
      '기존의 폐쇄적인 소집단·파벌이 새 학급에서도 배타적 구조를 형성하지 않도록(Gest & Rodkin, 2011) 3명 이상 밀집 그룹을 고르게 분산하면서 취약 학생의 최소 지지선만 유지합니다.',
    weights: {
      conflictSeparation: 90,
      safeBaseSupport: 60,
      cliqueDispersal: 100,
      leadershipBalance: 80,
      demographicBalance: 85,
    },
  },
];

export interface ManualConstraint {
  id: string;
  aId: string;
  bId: string;
  type: 'separate' | 'together';
  reason: string;
}

export type PlacementMap = Record<string, number>; // studentId -> classIndex (0..classCount-1)

export interface ConflictPairInfo {
  aId: string;
  bId: string;
  severity: 'mutual' | 'severe_oneway' | 'mild_oneway';
  scoreAB: number | null;
  scoreBA: number | null;
}

export interface StudentPlacementDiagnostic {
  studentId: string;
  classIndex: number;
  isVulnerable: boolean;
  conflictPeerIds: string[];
  supportPeerIds: string[];
  hasSafeBase: boolean;
  violatedSeparateIds: string[];
  violatedTogetherIds: string[];
  rationale: string;
}

export interface ClassBucketEvaluation {
  classIndex: number;
  label: string;
  memberIds: string[];
  maleCount: number;
  femaleCount: number;
  avgBelonging: number;
  avgInfluence: number;
  leaderCount: number;
  bridgeCount: number;
  isolatedCount: number;
  conflictTypeCount: number;
  conflictPairsInside: ConflictPairInfo[];
  mutualPairsInside: number;
  vulnerableTotal: number;
  vulnerableSecured: number;
  intactCliquesInside: Array<{ label: string; memberIds: string[] }>;
}

export interface PlacementAuditItem {
  id: string;
  severity: '충족' | '주의' | '경고';
  principle: string;
  title: string;
  detail: string;
  studentIds: string[];
}

export interface PlacementEvaluation {
  overallScore: number; // 0-100
  objectiveCost: number;
  totalConflictPairs: number;
  separatedConflictPairs: number;
  conflictSeparationRate: number; // 0-100
  vulnerableTotal: number;
  vulnerableSecured: number;
  vulnerableSafeBaseRate: number; // 0-100
  allStudentsBuddyCount: number;
  allStudentsBuddyRate: number; // 0-100
  intactLargeCliqueCount: number;
  manualViolationCount: number;
  headcountSpread: number;
  genderSpread: number;
  influenceSpread: number;
  balanceScore: number; // 0-100
  buckets: ClassBucketEvaluation[];
  diagnosticsById: Record<string, StudentPlacementDiagnostic>;
  auditItems: PlacementAuditItem[];
}

interface PlacementGraphContext {
  studentIds: string[];
  metricsById: Record<string, StudentMetrics>;
  conflictPairs: ConflictPairInfo[];
  conflictMap: Map<string, ConflictPairInfo>; // sorted "a__b" -> info
  pairScores: Map<string, number>; // "from__to" -> ClosenessScore
  mutualPairs: Array<[string, string]>;
  supportCandidates: Record<string, Set<string>>; // positive/warm supportive peers for safe base
  vulnerableIds: Set<string>;
  leaderIds: Set<string>;
  bridgeIds: Set<string>;
  clusters: FriendCluster[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildContext(
  students: Student[],
  responses: SurveyResponse[],
  analytics: ClassAnalytics
): PlacementGraphContext {
  const sortedStudents = [...students].sort((a, b) => a.number - b.number);
  const studentIds = sortedStudents.map((s) => s.id);
  const studentIdSet = new Set(studentIds);
  const metricsById = analytics.metricsById;

  const pairScores = new Map<string, number>();
  responses.forEach((resp) => {
    if (!studentIdSet.has(resp.studentDocId)) return;
    if (resp.peerRatings && resp.peerRatings.length > 0) {
      resp.peerRatings.forEach((pr) => {
        if (pr.targetId !== resp.studentDocId && studentIdSet.has(pr.targetId)) {
          pairScores.set(`${resp.studentDocId}__${pr.targetId}`, pr.score);
        }
      });
    } else {
      resp.answers.forEach((ans) => {
        ans.selectedIds.forEach((tid) => {
          if (tid !== resp.studentDocId && studentIdSet.has(tid)) {
            const k = `${resp.studentDocId}__${tid}`;
            if (ans.category === 'negative') {
              pairScores.set(k, -2);
            } else if (!pairScores.has(k)) {
              pairScores.set(k, 1);
            }
          }
        });
      });
    }
  });

  // Extract all conflict pairs
  const conflictPairs: ConflictPairInfo[] = [];
  const conflictMap = new Map<string, ConflictPairInfo>();
  const mutualPairs: Array<[string, string]> = [];

  for (let i = 0; i < studentIds.length; i++) {
    for (let j = i + 1; j < studentIds.length; j++) {
      const a = studentIds[i];
      const b = studentIds[j];
      const sAB = pairScores.get(`${a}__${b}`) ?? null;
      const sBA = pairScores.get(`${b}__${a}`) ?? null;

      const negAB = sAB !== null && sAB <= -1;
      const negBA = sBA !== null && sBA <= -1;

      if (negAB || negBA) {
        const severity: ConflictPairInfo['severity'] =
          negAB && negBA
            ? 'mutual'
            : sAB === -2 || sBA === -2
            ? 'severe_oneway'
            : 'mild_oneway';
        const info: ConflictPairInfo = { aId: a, bId: b, severity, scoreAB: sAB, scoreBA: sBA };
        conflictPairs.push(info);
        conflictMap.set(pairKey(a, b), info);
      }

      if (sAB !== null && sBA !== null && sAB >= 1 && sBA >= 1) {
        mutualPairs.push([a, b]);
      }
    }
  }

  // Identify vulnerable (isolated / low belonging), leaders, and bridges
  const vulnerableIds = new Set<string>();
  const leaderIds = new Set<string>();
  const bridgeIds = new Set<string>();

  const influenceSorted = [...analytics.metricsList].sort(
    (a, b) => b.influenceScore - a.influenceScore
  );
  const topLeaderCutoff = Math.max(
    45,
    influenceSorted[Math.min(influenceSorted.length - 1, Math.max(1, Math.floor(studentIds.length * 0.25)))]
      ?.influenceScore ?? 55
  );

  analytics.metricsList.forEach((m) => {
    if (
      m.isolationRisk === '높음' ||
      m.isolationRisk === '주의' ||
      m.sociometricType === '고립·관심형' ||
      m.belongingScore < 38
    ) {
      vulnerableIds.add(m.student.id);
    }
    if (m.influenceScore >= topLeaderCutoff && m.positiveIn >= 2) {
      leaderIds.add(m.student.id);
    }
    if (m.bridgeScore >= 50 && m.positiveIn >= 2) {
      bridgeIds.add(m.student.id);
    }
  });

  // Supportive buddy candidates per student (non-conflicting positive ties + recommended bridge peers for vulnerable)
  const supportCandidates: Record<string, Set<string>> = {};
  studentIds.forEach((id) => {
    const m = metricsById[id];
    const set = new Set<string>();
    if (m) {
      m.mutualIds.forEach((pid) => {
        if (!conflictMap.has(pairKey(id, pid))) set.add(pid);
      });
      m.chosenByPositive.forEach((pid) => {
        if (!conflictMap.has(pairKey(id, pid))) set.add(pid);
      });
      m.chosePositive.forEach((pid) => {
        if (!conflictMap.has(pairKey(id, pid))) set.add(pid);
      });
      if (vulnerableIds.has(id)) {
        m.recommendedPeerIds.forEach((pid) => {
          if (!conflictMap.has(pairKey(id, pid))) set.add(pid);
        });
      }
    }
    supportCandidates[id] = set;
  });

  const clusters = detectFriendClusters(analytics);

  return {
    studentIds,
    metricsById,
    conflictPairs,
    conflictMap,
    pairScores,
    mutualPairs,
    supportCandidates,
    vulnerableIds,
    leaderIds,
    bridgeIds,
    clusters,
  };
}

function computeCost(
  placement: PlacementMap,
  classCount: number,
  ctx: PlacementGraphContext,
  weights: PlacementWeights,
  constraints: ManualConstraint[]
): number {
  const n = ctx.studentIds.length;
  if (n === 0 || classCount <= 1) return 0;

  let cost = 0;

  // 0. Hard Manual Constraints (very high penalty)
  for (const c of constraints) {
    const ca = placement[c.aId];
    const cb = placement[c.bId];
    if (ca === undefined || cb === undefined) continue;
    if (c.type === 'separate' && ca === cb) {
      cost += 2500;
    } else if (c.type === 'together' && ca !== cb) {
      cost += 2500;
    }
  }

  // Per-class accumulators
  const counts = new Array(classCount).fill(0);
  const males = new Array(classCount).fill(0);
  const females = new Array(classCount).fill(0);
  const influenceSums = new Array(classCount).fill(0);
  const belongingSums = new Array(classCount).fill(0);
  const leaderCounts = new Array(classCount).fill(0);
  const bridgeCounts = new Array(classCount).fill(0);
  const vulnerableCounts = new Array(classCount).fill(0);
  const conflictTypeCounts = new Array(classCount).fill(0);

  for (const id of ctx.studentIds) {
    const ci = placement[id];
    if (ci === undefined) continue;
    const m = ctx.metricsById[id];
    counts[ci] += 1;
    if (m) {
      if (m.student.gender === '남') males[ci] += 1;
      else females[ci] += 1;
      influenceSums[ci] += m.influenceScore;
      belongingSums[ci] += m.belongingScore;
      if (ctx.leaderIds.has(id)) leaderCounts[ci] += 1;
      if (ctx.bridgeIds.has(id)) bridgeCounts[ci] += 1;
      if (ctx.vulnerableIds.has(id)) vulnerableCounts[ci] += 1;
      if (m.sociometricType === '갈등·주의형' || m.sociometricType === '양면형') {
        conflictTypeCounts[ci] += 1;
      }
    }
  }

  // 1. Strict headcount + demographic balance
  const idealSize = n / classCount;
  const totalMales = males.reduce((a, b) => a + b, 0);
  const totalFemales = females.reduce((a, b) => a + b, 0);
  const idealMale = totalMales / classCount;
  const idealFemale = totalFemales / classCount;
  const wDemo = weights.demographicBalance / 100;

  for (let c = 0; c < classCount; c++) {
    const sizeDiff = Math.abs(counts[c] - idealSize);
    // Keep class sizes within ±1 student strictly
    if (sizeDiff > 1.01) {
      cost += 900 * (sizeDiff - 1) * (sizeDiff - 1);
    } else {
      cost += (40 + 60 * wDemo) * sizeDiff * sizeDiff;
    }

    const maleDiff = Math.abs(males[c] - idealMale);
    const femaleDiff = Math.abs(females[c] - idealFemale);
    cost += (15 + 75 * wDemo) * (maleDiff * maleDiff + femaleDiff * femaleDiff);
  }

  // 2. Conflict pair separation (Coie & Dodge / Ladd)
  const wConflict = weights.conflictSeparation / 100;
  for (const cp of ctx.conflictPairs) {
    if (placement[cp.aId] === placement[cp.bId]) {
      const basePenalty =
        cp.severity === 'mutual' ? 280 : cp.severity === 'severe_oneway' ? 210 : 105;
      cost += basePenalty * (0.25 + 1.15 * wConflict);
    }
  }

  // 3. Psychological safe base / transition buddy support (Bowlby / Ladd)
  const wSafe = weights.safeBaseSupport / 100;
  for (const id of ctx.studentIds) {
    const ci = placement[id];
    const candidates = ctx.supportCandidates[id];
    if (!candidates || candidates.size === 0) continue;

    let mutualSame = 0;
    let warmSame = 0;
    candidates.forEach((pid) => {
      if (placement[pid] === ci) {
        warmSame += 1;
        if (ctx.metricsById[id]?.mutualIds.includes(pid)) {
          mutualSame += 1;
        }
      }
    });

    if (ctx.vulnerableIds.has(id)) {
      if (warmSame === 0) {
        cost += 220 * (0.2 + 1.2 * wSafe);
      } else if (mutualSame === 0 && (ctx.metricsById[id]?.mutualIds.length ?? 0) > 0) {
        cost += 45 * wSafe;
      }
    } else {
      // General students also benefit from at least 1 friendly peer during transition
      if (warmSame === 0) {
        cost += 55 * wSafe;
      }
    }
  }

  // 4. Exclusive clique dispersal (Gest & Rodkin, 2011)
  const wClique = weights.cliqueDispersal / 100;
  for (const cluster of ctx.clusters) {
    if (cluster.memberIds.length < 3) continue;
    const byClass = new Array(classCount).fill(0);
    cluster.memberIds.forEach((id) => {
      const ci = placement[id];
      if (ci !== undefined) byClass[ci] += 1;
    });
    const maxRecommendedInOneClass = Math.max(
      2,
      Math.ceil(cluster.memberIds.length / classCount)
    );
    for (let c = 0; c < classCount; c++) {
      if (byClass[c] > maxRecommendedInOneClass) {
        const excess = byClass[c] - maxRecommendedInOneClass;
        cost += 85 * excess * excess * wClique;
      } else if (byClass[c] >= 3 && wClique >= 0.6) {
        cost += 28 * (byClass[c] - 2) * wClique;
      }
    }
  }

  // 5. Leadership, Bridge, Belonging, & Attention-Student Balance
  const wLead = weights.leadershipBalance / 100;
  const avgInfPerClass =
    influenceSums.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const avgBelPerClass =
    belongingSums.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const idealLeaders = ctx.leaderIds.size / classCount;
  const idealBridges = ctx.bridgeIds.size / classCount;
  const idealVulnerable = ctx.vulnerableIds.size / classCount;
  const idealConflictTypes =
    conflictTypeCounts.reduce((a, b) => a + b, 0) / classCount;

  for (let c = 0; c < classCount; c++) {
    const cnt = Math.max(1, counts[c]);
    const classAvgInf = influenceSums[c] / cnt;
    const classAvgBel = belongingSums[c] / cnt;

    cost += 0.9 * Math.pow(classAvgInf - avgInfPerClass, 2) * wLead;
    cost += 0.55 * Math.pow(classAvgBel - avgBelPerClass, 2) * wDemo;
    cost += 55 * Math.pow(leaderCounts[c] - idealLeaders, 2) * wLead;
    cost += 35 * Math.pow(bridgeCounts[c] - idealBridges, 2) * wLead;
    cost += 55 * Math.pow(vulnerableCounts[c] - idealVulnerable, 2) * wDemo;
    cost += 65 * Math.pow(conflictTypeCounts[c] - idealConflictTypes, 2) * Math.max(wDemo, wConflict);
  }

  return cost;
}

/**
 * Runs multi-start local-search optimization (single moves + pairwise swaps)
 * grounded in educational psychology weights while strictly preserving locked students.
 */
export function optimizeClassPlacement(
  students: Student[],
  responses: SurveyResponse[],
  analytics: ClassAnalytics,
  classCount: number,
  weights: PlacementWeights,
  constraints: ManualConstraint[],
  lockedAssignments: PlacementMap = {},
  seed: number = 42
): PlacementMap {
  const safeClassCount = Math.max(2, Math.min(8, Math.round(classCount)));
  const ctx = buildContext(students, responses, analytics);
  const ids = ctx.studentIds;

  if (ids.length === 0) return {};

  const unlockedIds = ids.filter((id) => lockedAssignments[id] === undefined);
  let bestPlacement: PlacementMap = {};
  let bestCost = Number.POSITIVE_INFINITY;

  const restarts = 8;
  for (let run = 0; run < restarts; run++) {
    const rand = seededRandom(seed * 997 + run * 131 + 17);
    const current: PlacementMap = {};

    // Place locked students first (clamped to valid class range)
    const classCounts = new Array(safeClassCount).fill(0);
    ids.forEach((id) => {
      if (lockedAssignments[id] !== undefined) {
        const clamped = Math.max(0, Math.min(safeClassCount - 1, lockedAssignments[id]));
        current[id] = clamped;
        classCounts[clamped] += 1;
      }
    });

    // Stratified shuffled initialization by gender so starting balance is already strong
    const shuffledUnlocked = [...unlockedIds];
    for (let i = shuffledUnlocked.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffledUnlocked[i], shuffledUnlocked[j]] = [shuffledUnlocked[j], shuffledUnlocked[i]];
    }
    // Group by gender while keeping shuffled order inside each gender
    shuffledUnlocked.sort((a, b) => {
      const ga = ctx.metricsById[a]?.student.gender || '남';
      const gb = ctx.metricsById[b]?.student.gender || '남';
      return ga.localeCompare(gb);
    });

    for (const id of shuffledUnlocked) {
      // Pick the class with lowest current count (random tie-break)
      let minCount = Number.POSITIVE_INFINITY;
      let candidates: number[] = [];
      for (let c = 0; c < safeClassCount; c++) {
        if (classCounts[c] < minCount) {
          minCount = classCounts[c];
          candidates = [c];
        } else if (classCounts[c] === minCount) {
          candidates.push(c);
        }
      }
      const chosen = candidates[Math.floor(rand() * candidates.length)];
      current[id] = chosen;
      classCounts[chosen] += 1;
    }

    let currentCost = computeCost(current, safeClassCount, ctx, weights, constraints);

    // Simulated annealing + greedy hill climbing over moves & swaps
    const iterations = Math.min(1800, Math.max(400, unlockedIds.length * 45));
    for (let step = 0; step < iterations; step++) {
      if (unlockedIds.length === 0) break;
      const temp = Math.max(0.5, 45 * Math.pow(1 - step / iterations, 2));

      const doSwap = unlockedIds.length >= 2 && rand() < 0.72;
      if (doSwap) {
        const idxA = Math.floor(rand() * unlockedIds.length);
        let idxB = Math.floor(rand() * (unlockedIds.length - 1));
        if (idxB >= idxA) idxB += 1;

        const idA = unlockedIds[idxA];
        const idB = unlockedIds[idxB];
        const classA = current[idA];
        const classB = current[idB];
        if (classA === classB) continue;

        current[idA] = classB;
        current[idB] = classA;
        const nextCost = computeCost(current, safeClassCount, ctx, weights, constraints);
        const delta = nextCost - currentCost;

        if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
          currentCost = nextCost;
        } else {
          current[idA] = classA;
          current[idB] = classB;
        }
      } else {
        const idA = unlockedIds[Math.floor(rand() * unlockedIds.length)];
        const oldClass = current[idA];
        let newClass = Math.floor(rand() * (safeClassCount - 1));
        if (newClass >= oldClass) newClass += 1;

        current[idA] = newClass;
        const nextCost = computeCost(current, safeClassCount, ctx, weights, constraints);
        const delta = nextCost - currentCost;

        if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
          currentCost = nextCost;
        } else {
          current[idA] = oldClass;
        }
      }
    }

    // Deterministic polish pass: try every improving swap & move until local minimum
    let improved = true;
    let polishPasses = 0;
    while (improved && polishPasses < 6) {
      improved = false;
      polishPasses += 1;
      for (let i = 0; i < unlockedIds.length; i++) {
        const idA = unlockedIds[i];
        const origA = current[idA];
        // Try moving idA to any other class
        for (let c = 0; c < safeClassCount; c++) {
          if (c === origA) continue;
          current[idA] = c;
          const nextCost = computeCost(current, safeClassCount, ctx, weights, constraints);
          if (nextCost + 0.01 < currentCost) {
            currentCost = nextCost;
            improved = true;
            break;
          } else {
            current[idA] = origA;
          }
        }
        // Try swapping idA with idB
        for (let j = i + 1; j < unlockedIds.length; j++) {
          const idB = unlockedIds[j];
          const classA = current[idA];
          const classB = current[idB];
          if (classA === classB) continue;
          current[idA] = classB;
          current[idB] = classA;
          const nextCost = computeCost(current, safeClassCount, ctx, weights, constraints);
          if (nextCost + 0.01 < currentCost) {
            currentCost = nextCost;
            improved = true;
          } else {
            current[idA] = classA;
            current[idB] = classB;
          }
        }
      }
    }

    if (currentCost < bestCost) {
      bestCost = currentCost;
      bestPlacement = { ...current };
    }
  }

  return bestPlacement;
}

/**
 * Evaluates any placement map (auto-generated or manually edited by the teacher)
 * against all 5 educational psychology principles and generates live audit findings.
 */
export function evaluateClassPlacement(
  students: Student[],
  responses: SurveyResponse[],
  analytics: ClassAnalytics,
  placement: PlacementMap,
  classCount: number,
  weights: PlacementWeights,
  constraints: ManualConstraint[]
): PlacementEvaluation {
  const safeClassCount = Math.max(2, Math.min(8, Math.round(classCount)));
  const ctx = buildContext(students, responses, analytics);

  const buckets: ClassBucketEvaluation[] = Array.from({ length: safeClassCount }, (_, idx) => ({
    classIndex: idx,
    label: `${idx + 1}반`,
    memberIds: [],
    maleCount: 0,
    femaleCount: 0,
    avgBelonging: 0,
    avgInfluence: 0,
    leaderCount: 0,
    bridgeCount: 0,
    isolatedCount: 0,
    conflictTypeCount: 0,
    conflictPairsInside: [],
    mutualPairsInside: 0,
    vulnerableTotal: 0,
    vulnerableSecured: 0,
    intactCliquesInside: [],
  }));

  // Assign members to buckets
  ctx.studentIds.forEach((id) => {
    const ci = Math.max(0, Math.min(safeClassCount - 1, placement[id] ?? 0));
    buckets[ci].memberIds.push(id);
  });

  // Compute student-level diagnostics
  const diagnosticsById: Record<string, StudentPlacementDiagnostic> = {};
  let vulnerableSecured = 0;
  let allStudentsBuddyCount = 0;

  ctx.studentIds.forEach((id) => {
    const ci = Math.max(0, Math.min(safeClassCount - 1, placement[id] ?? 0));
    const sameClassSet = new Set(buckets[ci].memberIds);
    const conflictPeerIds: string[] = [];
    const supportPeerIds: string[] = [];
    const violatedSeparateIds: string[] = [];
    const violatedTogetherIds: string[] = [];

    sameClassSet.forEach((otherId) => {
      if (otherId === id) return;
      if (ctx.conflictMap.has(pairKey(id, otherId))) {
        conflictPeerIds.push(otherId);
      }
      if (ctx.supportCandidates[id]?.has(otherId)) {
        supportPeerIds.push(otherId);
      }
    });

    constraints.forEach((c) => {
      const other = c.aId === id ? c.bId : c.bId === id ? c.aId : null;
      if (!other) return;
      const otherClass = placement[other];
      if (c.type === 'separate' && otherClass === ci) {
        violatedSeparateIds.push(other);
      } else if (c.type === 'together' && otherClass !== ci) {
        violatedTogetherIds.push(other);
      }
    });

    const isVulnerable = ctx.vulnerableIds.has(id);
    const hasSupportCandidates = (ctx.supportCandidates[id]?.size ?? 0) > 0;
    const hasSafeBase = supportPeerIds.length > 0 || !hasSupportCandidates;

    if (isVulnerable && supportPeerIds.length > 0) {
      vulnerableSecured += 1;
    }
    if (supportPeerIds.length > 0) {
      allStudentsBuddyCount += 1;
    }

    const nameOf = (pid: string) => {
      const st = ctx.metricsById[pid]?.student;
      return st ? `${st.number}번 ${st.name}` : pid;
    };

    let rationale = '성비·인원 및 관계 균형 기준 충족';
    if (violatedSeparateIds.length > 0) {
      rationale = `필수 분리 위반: ${violatedSeparateIds.map(nameOf).join(', ')}`;
    } else if (violatedTogetherIds.length > 0) {
      rationale = `필수 동반 미충족: ${violatedTogetherIds.map(nameOf).join(', ')}`;
    } else if (conflictPeerIds.length > 0) {
      rationale = `갈등 주의: ${conflictPeerIds.map(nameOf).join(', ')}와 같은 반`;
    } else if (isVulnerable && supportPeerIds.length > 0) {
      rationale = `정서적 안전기지 확보 (${nameOf(supportPeerIds[0])} 동반)`;
    } else if (isVulnerable && hasSupportCandidates) {
      rationale = '지지 친구 없음 · 안전기지 보완 권장';
    } else if (ctx.leaderIds.has(id)) {
      rationale = '학급 친사회적 리더 균형 배치';
    } else if (ctx.bridgeIds.has(id)) {
      rationale = '집단 간 가교 역할 배치';
    } else if (supportPeerIds.length > 0) {
      rationale = `지지 친구 ${supportPeerIds.length}명 동반`;
    }

    diagnosticsById[id] = {
      studentId: id,
      classIndex: ci,
      isVulnerable,
      conflictPeerIds,
      supportPeerIds,
      hasSafeBase,
      violatedSeparateIds,
      violatedTogetherIds,
      rationale,
    };
  });

  // Aggregate bucket metrics
  let separatedConflictPairs = 0;
  ctx.conflictPairs.forEach((cp) => {
    const ca = placement[cp.aId] ?? 0;
    const cb = placement[cp.bId] ?? 0;
    if (ca === cb) {
      buckets[ca]?.conflictPairsInside.push(cp);
    } else {
      separatedConflictPairs += 1;
    }
  });

  ctx.mutualPairs.forEach(([a, b]) => {
    const ca = placement[a] ?? 0;
    const cb = placement[b] ?? 0;
    if (ca === cb && buckets[ca]) {
      buckets[ca].mutualPairsInside += 1;
    }
  });

  let intactLargeCliqueCount = 0;
  ctx.clusters.forEach((cl) => {
    if (cl.memberIds.length < 3) return;
    const byClass: Record<number, string[]> = {};
    cl.memberIds.forEach((id) => {
      const ci = placement[id] ?? 0;
      if (!byClass[ci]) byClass[ci] = [];
      byClass[ci].push(id);
    });
    Object.entries(byClass).forEach(([cStr, members]) => {
      const ci = Number(cStr);
      if (members.length >= 3 && buckets[ci]) {
        buckets[ci].intactCliquesInside.push({ label: cl.label, memberIds: members });
        intactLargeCliqueCount += 1;
      }
    });
  });

  buckets.forEach((b) => {
    let belSum = 0;
    let infSum = 0;
    b.memberIds.forEach((id) => {
      const m = ctx.metricsById[id];
      if (!m) return;
      if (m.student.gender === '남') b.maleCount += 1;
      else b.femaleCount += 1;
      belSum += m.belongingScore;
      infSum += m.influenceScore;
      if (ctx.leaderIds.has(id)) b.leaderCount += 1;
      if (ctx.bridgeIds.has(id)) b.bridgeCount += 1;
      if (ctx.vulnerableIds.has(id)) {
        b.isolatedCount += 1;
        b.vulnerableTotal += 1;
        if (diagnosticsById[id]?.supportPeerIds.length > 0) {
          b.vulnerableSecured += 1;
        }
      }
      if (m.sociometricType === '갈등·주의형' || m.sociometricType === '양면형') {
        b.conflictTypeCount += 1;
      }
    });
    const cnt = b.memberIds.length;
    b.avgBelonging = cnt > 0 ? Math.round(belSum / cnt) : 0;
    b.avgInfluence = cnt > 0 ? Math.round(infSum / cnt) : 0;
  });

  // Manual constraint violations
  let manualViolationCount = 0;
  const violatedConstraints: ManualConstraint[] = [];
  constraints.forEach((c) => {
    const ca = placement[c.aId];
    const cb = placement[c.bId];
    if (ca === undefined || cb === undefined) return;
    if ((c.type === 'separate' && ca === cb) || (c.type === 'together' && ca !== cb)) {
      manualViolationCount += 1;
      violatedConstraints.push(c);
    }
  });

  // Spread metrics
  const sizes = buckets.map((b) => b.memberIds.length);
  const headcountSpread = Math.max(...sizes) - Math.min(...sizes);
  const maleRatios = buckets.map((b) =>
    b.memberIds.length > 0 ? (b.maleCount / b.memberIds.length) * 100 : 50
  );
  const genderSpread = Math.round(Math.max(...maleRatios) - Math.min(...maleRatios));
  const infAvgs = buckets.map((b) => b.avgInfluence);
  const influenceSpread = Math.max(...infAvgs) - Math.min(...infAvgs);

  const totalConflictPairs = ctx.conflictPairs.length;
  const conflictSeparationRate =
    totalConflictPairs > 0
      ? Math.round((separatedConflictPairs / totalConflictPairs) * 100)
      : 100;

  const vulnerableWithCandidates = Array.from(ctx.vulnerableIds).filter(
    (id) => (ctx.supportCandidates[id]?.size ?? 0) > 0
  ).length;
  const vulnerableTotal = ctx.vulnerableIds.size;
  const vulnerableSafeBaseRate =
    vulnerableWithCandidates > 0
      ? Math.round((vulnerableSecured / vulnerableWithCandidates) * 100)
      : 100;

  const allStudentsBuddyRate =
    ctx.studentIds.length > 0
      ? Math.round((allStudentsBuddyCount / ctx.studentIds.length) * 100)
      : 100;

  const balanceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          Math.max(0, headcountSpread - 1) * 18 -
          Math.max(0, genderSpread - 10) * 0.9 -
          Math.max(0, influenceSpread - 6) * 1.4
      )
    )
  );

  // Weighted suitability score (0-100)
  const cliqueScore = Math.max(0, 100 - intactLargeCliqueCount * 22);
  const wSum =
    weights.conflictSeparation +
    weights.safeBaseSupport +
    weights.cliqueDispersal +
    weights.leadershipBalance +
    weights.demographicBalance;

  const rawScore =
    wSum > 0
      ? (conflictSeparationRate * weights.conflictSeparation +
          vulnerableSafeBaseRate * weights.safeBaseSupport +
          cliqueScore * weights.cliqueDispersal +
          balanceScore * (weights.leadershipBalance + weights.demographicBalance)) /
        wSum
      : 100;

  const overallScore = Math.max(
    0,
    Math.min(100, Math.round(rawScore - manualViolationCount * 15))
  );

  // Build transparent educational-psychology audit items
  const auditItems: PlacementAuditItem[] = [];
  const nameOf = (id: string) => {
    const st = ctx.metricsById[id]?.student;
    return st ? `${st.number}번 ${st.name}` : id;
  };

  if (violatedConstraints.length > 0) {
    auditItems.push({
      id: 'manual_violation',
      severity: '경고',
      principle: '교사 수동 제약',
      title: `교사 설정 필수 제약 ${violatedConstraints.length}건 미충족`,
      detail: violatedConstraints
        .map(
          (c) =>
            `${nameOf(c.aId)}·${nameOf(c.bId)} (${c.type === 'separate' ? '필수 분리' : '필수 동반'})`
        )
        .join(', '),
      studentIds: Array.from(new Set(violatedConstraints.flatMap((c) => [c.aId, c.bId]))),
    });
  }

  const remainingConflicts = buckets.flatMap((b) =>
    b.conflictPairsInside.map((cp) => ({ label: b.label, cp }))
  );
  if (remainingConflicts.length > 0) {
    auditItems.push({
      id: 'conflict_remaining',
      severity: remainingConflicts.some((r) => r.cp.severity !== 'mild_oneway') ? '경고' : '주의',
      principle: '갈등 분리 원칙 (Coie & Dodge)',
      title: `동일 학급 내 갈등·불편 쌍 ${remainingConflicts.length}건 잔존`,
      detail: remainingConflicts
        .slice(0, 4)
        .map(
          (r) =>
            `${r.label}: ${nameOf(r.cp.aId)}↔${nameOf(r.cp.bId)} (${
              r.cp.severity === 'mutual'
                ? '상호 갈등'
                : r.cp.severity === 'severe_oneway'
                ? '강한 불편 -2'
                : '어색함 -1'
            })`
        )
        .join(' · '),
      studentIds: Array.from(
        new Set(remainingConflicts.flatMap((r) => [r.cp.aId, r.cp.bId]))
      ),
    });
  } else if (totalConflictPairs > 0) {
    auditItems.push({
      id: 'conflict_clear',
      severity: '충족',
      principle: '갈등 분리 원칙 (Coie & Dodge)',
      title: `조사된 갈등·불편 쌍 ${totalConflictPairs}건 모두 다른 학급으로 분리됨`,
      detail: '불편감(-2) 및 어색함(-1)이 보고된 모든 학생 쌍이 서로 다른 반에 배치되어 전환기 정서적 갈등 위험을 낮췄습니다.',
      studentIds: [],
    });
  }

  const unsecuredVulnerable = Array.from(ctx.vulnerableIds).filter(
    (id) =>
      (ctx.supportCandidates[id]?.size ?? 0) > 0 &&
      (diagnosticsById[id]?.supportPeerIds.length ?? 0) === 0
  );
  if (unsecuredVulnerable.length > 0) {
    auditItems.push({
      id: 'safe_base_gap',
      severity: '주의',
      principle: '정서적 안전기지 (Bowlby · Ladd)',
      title: `관심·고립 학생 ${unsecuredVulnerable.length}명의 지지 친구 동반 보완 필요`,
      detail: `${unsecuredVulnerable.map(nameOf).join(', ')} 학생이 긍정적으로 교류하던 친구 또는 추천 가교 파트너와 다른 반에 배정되었습니다.`,
      studentIds: unsecuredVulnerable,
    });
  } else if (vulnerableTotal > 0) {
    auditItems.push({
      id: 'safe_base_ok',
      severity: '충족',
      principle: '정서적 안전기지 (Bowlby · Ladd)',
      title: `고립·관심 학생 ${vulnerableTotal}명 전원 정서적 안전기지 확보`,
      detail: '새 학기 적응 지원이 필요한 학생 모두가 우호적 친구 또는 친사회적 가교 학생과 함께 배정되었습니다.',
      studentIds: Array.from(ctx.vulnerableIds),
    });
  }

  const intactCliques = buckets.flatMap((b) =>
    b.intactCliquesInside.map((cl) => ({ classLabel: b.label, ...cl }))
  );
  if (intactCliques.length > 0) {
    auditItems.push({
      id: 'clique_intact',
      severity: '주의',
      principle: '소집단 분산 원칙 (Gest & Rodkin)',
      title: `3명 이상 기존 또래 그룹이 동일 반에 잔존 (${intactCliques.length}건)`,
      detail: intactCliques
        .map((c) => `${c.classLabel}에 ${c.label} ${c.memberIds.length}명(${c.memberIds.map(nameOf).join(', ')})`)
        .join(' · '),
      studentIds: Array.from(new Set(intactCliques.flatMap((c) => c.memberIds))),
    });
  } else if (ctx.clusters.some((c) => c.memberIds.length >= 3)) {
    auditItems.push({
      id: 'clique_dispersed',
      severity: '충족',
      principle: '소집단 분산 원칙 (Gest & Rodkin)',
      title: '3명 이상 밀집 또래 집단이 학급별로 균형 분산됨',
      detail: '특정 파벌이 새 학급의 주도권을 독점하거나 타 학생을 배제하는 현상을 예방하고 새로운 교우 형성을 돕습니다.',
      studentIds: [],
    });
  }

  const objectiveCost = computeCost(placement, safeClassCount, ctx, weights, constraints);

  return {
    overallScore,
    objectiveCost,
    totalConflictPairs,
    separatedConflictPairs,
    conflictSeparationRate,
    vulnerableTotal,
    vulnerableSecured,
    vulnerableSafeBaseRate,
    allStudentsBuddyCount,
    allStudentsBuddyRate,
    intactLargeCliqueCount,
    manualViolationCount,
    headcountSpread,
    genderSpread,
    influenceSpread,
    balanceScore,
    buckets,
    diagnosticsById,
    auditItems,
  };
}

/**
 * Recommends the best alternative class for a specific student given current placement & weights.
 */
export function rankClassesForStudent(
  studentId: string,
  students: Student[],
  responses: SurveyResponse[],
  analytics: ClassAnalytics,
  placement: PlacementMap,
  classCount: number,
  weights: PlacementWeights,
  constraints: ManualConstraint[]
): Array<{ classIndex: number; label: string; costDelta: number; conflictsInClass: number; supportsInClass: number }> {
  const safeClassCount = Math.max(2, Math.min(8, Math.round(classCount)));
  const ctx = buildContext(students, responses, analytics);
  const currentCost = computeCost(placement, safeClassCount, ctx, weights, constraints);

  return Array.from({ length: safeClassCount }, (_, ci) => {
    const testMap: PlacementMap = { ...placement, [studentId]: ci };
    const nextCost = computeCost(testMap, safeClassCount, ctx, weights, constraints);

    let conflictsInClass = 0;
    let supportsInClass = 0;
    ctx.studentIds.forEach((otherId) => {
      if (otherId === studentId) return;
      if ((placement[otherId] ?? 0) === ci) {
        if (ctx.conflictMap.has(pairKey(studentId, otherId))) conflictsInClass += 1;
        if (ctx.supportCandidates[studentId]?.has(otherId)) supportsInClass += 1;
      }
    });

    return {
      classIndex: ci,
      label: `${ci + 1}반`,
      costDelta: Math.round(nextCost - currentCost),
      conflictsInClass,
      supportsInClass,
    };
  }).sort((a, b) => a.costDelta - b.costDelta);
}

export function exportPlacementToCsv(
  evaluation: PlacementEvaluation,
  analytics: ClassAnalytics,
  lockedAssignments: PlacementMap
): string {
  const header =
    '배정반,학생ID,기존번호,이름,성별,교우관계유형,소속감지수,영향력지수,고정여부,같은반_지지친구,같은반_갈등주의,배정근거';
  const esc = (v: string) =>
    v.includes(',') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
  const nameOf = (id: string) => {
    const st = analytics.metricsById[id]?.student;
    return st ? `${st.number}번 ${st.name}` : id;
  };

  const rows: string[] = [];
  evaluation.buckets.forEach((bucket) => {
    const members = bucket.memberIds
      .map((id) => analytics.metricsById[id])
      .filter(Boolean)
      .sort((a, b) => a.student.number - b.student.number);

    members.forEach((m) => {
      const diag = evaluation.diagnosticsById[m.student.id];
      const locked = lockedAssignments[m.student.id] !== undefined ? '고정' : '';
      const supports = (diag?.supportPeerIds || []).map(nameOf).join(' / ');
      const conflicts = (diag?.conflictPeerIds || []).map(nameOf).join(' / ');

      rows.push(
        [
          bucket.label,
          m.student.studentCode,
          m.student.number,
          esc(m.student.name),
          m.student.gender,
          m.sociometricType,
          m.belongingScore,
          m.influenceScore,
          locked,
          esc(supports),
          esc(conflicts),
          esc(diag?.rationale || ''),
        ].join(',')
      );
    });
  });

  return '\uFEFF' + [header, ...rows].join('\n');
}
