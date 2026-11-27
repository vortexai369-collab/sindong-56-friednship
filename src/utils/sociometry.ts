import {
  AsymmetricPair,
  ClassAnalytics,
  ClosenessAnalyticsSummary,
  ClosenessPairSummary,
  ClosenessScore,
  ClosenessScoreCounts,
  Gender,
  IsolationRiskLevel,
  PeerRating,
  ReportFinding,
  ReportRecommendation,
  SociogramEdge,
  SociometricType,
  SociometryReportSummary,
  Student,
  StudentMetrics,
  SurveyAnswer,
  SurveyResponse,
  TagClosenessStat,
} from '../types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateAccessCode(length = 5): string {
  let result = '';
  const values = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  }
  return result;
}

export function generateJoinCode(): string {
  return `C${generateAccessCode(5)}`;
}

export function sanitizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function buildInviteKey(joinCode: string, accessCode: string): string {
  return `${sanitizeCode(joinCode)}_${sanitizeCode(accessCode)}`;
}

export function formatScoreLabel(score: ClosenessScore | undefined | null): string {
  if (score === 2) return '매우 친함 (+2)';
  if (score === 1) return '친한 편 (+1)';
  if (score === 0) return '보통 (0)';
  if (score === -1) return '어색함 (-1)';
  if (score === -2) return '불편함 (-2)';
  return '미평가';
}

/**
 * Derives compatible summary `SurveyAnswer[]` from 1:1 `PeerRating[]`
 * so legacy filters and summary queries work seamlessly alongside detailed ratings.
 */
export function deriveAnswersFromPeerRatings(
  peerRatings: PeerRating[],
  questionIds: Array<{ id: string; category: 'positive' | 'negative' }>
): SurveyAnswer[] {
  const veryCloseIds = peerRatings.filter((r) => r.score === 2).map((r) => r.targetId);
  const collabOrFriendlyIds = peerRatings
    .filter((r) => r.score >= 1 && (r.tags.includes('모둠협업') || r.score === 2))
    .map((r) => r.targetId);
  const trustIds = peerRatings
    .filter((r) => r.score >= 1 && (r.tags.includes('도움·신뢰') || r.tags.includes('고민상담')))
    .map((r) => r.targetId);
  const allPosIds = peerRatings.filter((r) => r.score >= 1).map((r) => r.targetId);
  const negIds = peerRatings.filter((r) => r.score <= -1).map((r) => r.targetId);

  if (questionIds.length === 0) {
    return [
      { questionId: 'q1', category: 'positive', selectedIds: veryCloseIds },
      { questionId: 'q2', category: 'positive', selectedIds: allPosIds },
      { questionId: 'q4', category: 'negative', selectedIds: negIds },
    ];
  }

  let posIndex = 0;
  return questionIds.slice(0, 8).map((q) => {
    if (q.category === 'negative') {
      return { questionId: q.id, category: 'negative', selectedIds: negIds };
    }
    posIndex += 1;
    if (posIndex === 1) {
      return {
        questionId: q.id,
        category: 'positive',
        selectedIds: veryCloseIds.length > 0 ? veryCloseIds : allPosIds,
      };
    }
    if (posIndex === 2) {
      return {
        questionId: q.id,
        category: 'positive',
        selectedIds: collabOrFriendlyIds.length > 0 ? collabOrFriendlyIds : allPosIds,
      };
    }
    if (posIndex === 3) {
      return {
        questionId: q.id,
        category: 'positive',
        selectedIds: trustIds.length > 0 ? trustIds : veryCloseIds,
      };
    }
    return { questionId: q.id, category: 'positive', selectedIds: allPosIds };
  });
}

export interface ParsedRosterRow {
  studentCode: string;
  number: number;
  name: string;
  gender: Gender;
  accessCode: string;
  status: '미응답' | '응답완료';
}

export function parseRosterText(
  rawText: string,
  existingCodes: Set<string> = new Set()
): ParsedRosterRow[] {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );

  const firstRow = rows[0];
  const hasHeader = firstRow.some(
    (cell) =>
      cell.includes('이름') ||
      cell.includes('번호') ||
      cell.includes('학생ID') ||
      cell.includes('성별') ||
      cell.toLowerCase().includes('name')
  );

  let idxStudentCode = -1;
  let idxNumber = -1;
  let idxName = -1;
  let idxGender = -1;
  let idxAccessCode = -1;
  let idxStatus = -1;

  if (hasHeader) {
    firstRow.forEach((h, i) => {
      const normalized = h.replace(/\s+/g, '').toLowerCase();
      if (normalized.includes('학생id') || normalized === 'id' || normalized === 'studentid') {
        idxStudentCode = i;
      } else if (normalized.includes('번호') || normalized === 'no' || normalized === 'number') {
        idxNumber = i;
      } else if (normalized.includes('이름') || normalized.includes('성명') || normalized === 'name') {
        idxName = i;
      } else if (normalized.includes('성별') || normalized === 'gender') {
        idxGender = i;
      } else if (normalized.includes('코드') || normalized === 'code' || normalized === 'accesscode') {
        idxAccessCode = i;
      } else if (normalized.includes('상태') || normalized === 'status') {
        idxStatus = i;
      }
    });
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const usedCodes = new Set(existingCodes);
  const parsed: ParsedRosterRow[] = [];

  dataRows.forEach((cols, rowIdx) => {
    let studentCode = '';
    let num = rowIdx + 1;
    let name = '';
    let genderRaw = '남';
    let codeRaw = '';
    let statusRaw = '미응답';

    if (hasHeader) {
      if (idxStudentCode >= 0) studentCode = cols[idxStudentCode] || '';
      if (idxNumber >= 0 && cols[idxNumber]) {
        const parsedNum = parseInt(cols[idxNumber].replace(/[^0-9]/g, ''), 10);
        if (!Number.isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 100) num = parsedNum;
      }
      if (idxName >= 0) name = cols[idxName] || '';
      if (idxGender >= 0) genderRaw = cols[idxGender] || '남';
      if (idxAccessCode >= 0) codeRaw = cols[idxAccessCode] || '';
      if (idxStatus >= 0) statusRaw = cols[idxStatus] || '미응답';
    } else if (cols.length >= 4 && /^s?\d+/i.test(cols[0]) && /^\d+$/.test(cols[1])) {
      studentCode = cols[0];
      num = parseInt(cols[1], 10) || rowIdx + 1;
      name = cols[2] || '';
      genderRaw = cols[3] || '남';
      codeRaw = cols[4] || '';
      statusRaw = cols[5] || '미응답';
    } else if (cols.length >= 2 && /^\d+$/.test(cols[0])) {
      num = parseInt(cols[0], 10) || rowIdx + 1;
      name = cols[1] || '';
      genderRaw = cols[2] || '남';
      codeRaw = cols[3] || '';
    } else {
      name = cols[0] || '';
      genderRaw = cols[1] || '남';
    }

    name = name.trim().slice(0, 40);
    if (!name) return;

    const gender: Gender =
      genderRaw.includes('여') ||
      genderRaw.toUpperCase() === 'F' ||
      genderRaw.toUpperCase() === 'FEMALE'
        ? '여'
        : '남';

    if (!studentCode) {
      studentCode = `S${String(num).padStart(2, '0')}`;
    } else {
      studentCode = studentCode.slice(0, 32);
    }

    let accessCode = sanitizeCode(codeRaw).slice(0, 16);
    if (accessCode.length < 4 || usedCodes.has(accessCode)) {
      do {
        accessCode = generateAccessCode(5);
      } while (usedCodes.has(accessCode));
    }
    usedCodes.add(accessCode);

    const status = statusRaw === '응답완료' ? '응답완료' : '미응답';

    parsed.push({
      studentCode,
      number: Math.max(1, Math.min(100, num)),
      name,
      gender,
      accessCode,
      status,
    });
  });

  return parsed.slice(0, 60);
}

export function exportRosterToCsv(students: Student[], respondedIds: Set<string>): string {
  const header = '학생ID,번호,이름,성별,코드,상태';
  const sorted = [...students].sort((a, b) => a.number - b.number);
  const rows = sorted.map((s) => {
    const liveStatus = respondedIds.has(s.id) || s.status === '응답완료' ? '응답완료' : '미응답';
    const safeName = s.name.includes(',') ? `"${s.name.replace(/"/g, '""')}"` : s.name;
    return `${s.studentCode},${s.number},${safeName},${s.gender},${s.accessCode},${liveStatus}`;
  });
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function exportAnalyticsToCsv(analytics: ClassAnalytics): string {
  const header =
    '학생ID,번호,이름,성별,응답상태,소속감지수,영향력지수,가교지수,고립위험도,받은평균친밀도,준평균친밀도,받은+2,받은+1,받은0,받은-1,받은-2,상호단짝(+2),상호친구수,교우관계유형,교사메모';
  const rows = [...analytics.metricsList]
    .sort((a, b) => a.student.number - b.student.number)
    .map((m) => {
      const esc = (v: string) =>
        v.includes(',') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      return [
        m.student.studentCode,
        m.student.number,
        esc(m.student.name),
        m.student.gender,
        m.responded ? '응답완료' : '미응답',
        m.belongingScore,
        m.influenceScore,
        m.bridgeScore,
        m.isolationRisk,
        m.avgClosenessReceived !== null ? m.avgClosenessReceived.toFixed(2) : '',
        m.avgClosenessGiven !== null ? m.avgClosenessGiven.toFixed(2) : '',
        m.receivedScoreCounts[2],
        m.receivedScoreCounts[1],
        m.receivedScoreCounts[0],
        m.receivedScoreCounts[-1],
        m.receivedScoreCounts[-2],
        m.bestFriendPairIds.length,
        m.mutualIds.length,
        m.sociometricType,
        esc(m.student.memo || ''),
      ].join(',');
    });
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function triggerCsvDownload(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function emptyScoreCounts(): ClosenessScoreCounts {
  return { '-2': 0, '-1': 0, '0': 0, '1': 0, '2': 0 };
}

/**
 * Computes complete classroom sociometry metrics & 5-level closeness analytics from 1:1 peerRatings
 * (with fallback to legacy answers), including directed/mutual graph edges, Coie & Dodge classification,
 * closeness distributions, given-vs-received profiles, pair tiers, tag intensity stats, and temperature gaps.
 */
export function computeClassAnalytics(
  students: Student[],
  responses: SurveyResponse[],
  filterMode: string = 'all' // 'all' | 'score2' | 'score1' | 'score1plus' | 'scoreNeg1' | 'scoreNeg2' | 'negative' | specific questionId | tag:<tagName>
): ClassAnalytics {
  const sortedStudents = [...students].sort((a, b) => a.number - b.number);
  const studentIdSet = new Set(sortedStudents.map((s) => s.id));
  const responseMap = new Map<string, SurveyResponse>();
  responses.forEach((r) => {
    if (studentIdSet.has(r.studentDocId)) {
      responseMap.set(r.studentDocId, r);
    }
  });

  const posEdgeMap = new Map<
    string,
    { weight: number; maxScore: number; minScore: number; tags: string[]; questionIds: string[] }
  >();
  const negEdgeMap = new Map<
    string,
    { weight: number; maxScore: number; minScore: number; tags: string[]; questionIds: string[] }
  >();

  // Pairwise score matrix for closeness analytics & temperature-gap detection
  const pairScoreMap = new Map<string, { score: ClosenessScore; tags: string[] }>();

  const chosenByPos: Record<string, Set<string>> = {};
  const chosePos: Record<string, Set<string>> = {};
  const posInTotalCount: Record<string, number> = {};
  const veryCloseInCount: Record<string, number> = {};
  const chosenByNeg: Record<string, Set<string>> = {};
  const choseNeg: Record<string, Set<string>> = {};
  const receivedScoreSum: Record<string, number> = {};
  const receivedScoreCount: Record<string, number> = {};
  const givenScoreSum: Record<string, number> = {};
  const givenScoreCount: Record<string, number> = {};
  const receivedCountsMap: Record<string, ClosenessScoreCounts> = {};
  const givenCountsMap: Record<string, ClosenessScoreCounts> = {};
  const posTagCounts: Record<string, Record<string, number>> = {};
  const negTagCounts: Record<string, Record<string, number>> = {};

  const classDistribution: ClosenessScoreCounts = emptyScoreCounts();
  let totalRatingsCount = 0;
  let totalRatingsSum = 0;
  const globalTagStatsMap = new Map<string, TagClosenessStat>();

  sortedStudents.forEach((s) => {
    chosenByPos[s.id] = new Set();
    chosePos[s.id] = new Set();
    posInTotalCount[s.id] = 0;
    veryCloseInCount[s.id] = 0;
    chosenByNeg[s.id] = new Set();
    choseNeg[s.id] = new Set();
    receivedScoreSum[s.id] = 0;
    receivedScoreCount[s.id] = 0;
    givenScoreSum[s.id] = 0;
    givenScoreCount[s.id] = 0;
    receivedCountsMap[s.id] = emptyScoreCounts();
    givenCountsMap[s.id] = emptyScoreCounts();
    posTagCounts[s.id] = {};
    negTagCounts[s.id] = {};
  });

  const isTagFilter = filterMode.startsWith('tag:');
  const targetTag = isTagFilter ? filterMode.slice(4) : '';

  responseMap.forEach((resp, fromId) => {
    const ratings = resp.peerRatings;
    if (ratings && ratings.length > 0) {
      ratings.forEach((r) => {
        if (r.targetId === fromId || !studentIdSet.has(r.targetId)) return;
        const key = `${fromId}__${r.targetId}`;

        // Always record true pairwise scores & overall class/student closeness stats
        pairScoreMap.set(key, { score: r.score, tags: r.tags || [] });
        receivedScoreSum[r.targetId] += r.score;
        receivedScoreCount[r.targetId] += 1;
        givenScoreSum[fromId] += r.score;
        givenScoreCount[fromId] += 1;
        receivedCountsMap[r.targetId][r.score] += 1;
        givenCountsMap[fromId][r.score] += 1;

        classDistribution[r.score] += 1;
        totalRatingsCount += 1;
        totalRatingsSum += r.score;

        if (r.score === 2) {
          veryCloseInCount[r.targetId] += 1;
        }
        (r.tags || []).forEach((tag) => {
          if (r.score >= 1) {
            posTagCounts[r.targetId][tag] = (posTagCounts[r.targetId][tag] || 0) + 1;
            const existing = globalTagStatsMap.get(`pos:${tag}`) || {
              tag,
              category: 'positive' as const,
              totalCount: 0,
              strongCount: 0,
              mildCount: 0,
            };
            existing.totalCount += 1;
            if (r.score === 2) existing.strongCount += 1;
            else existing.mildCount += 1;
            globalTagStatsMap.set(`pos:${tag}`, existing);
          } else if (r.score <= -1) {
            negTagCounts[r.targetId][tag] = (negTagCounts[r.targetId][tag] || 0) + 1;
            const existing = globalTagStatsMap.get(`neg:${tag}`) || {
              tag,
              category: 'negative' as const,
              totalCount: 0,
              strongCount: 0,
              mildCount: 0,
            };
            existing.totalCount += 1;
            if (r.score === -2) existing.strongCount += 1;
            else existing.mildCount += 1;
            globalTagStatsMap.set(`neg:${tag}`, existing);
          }
        });

        // Apply active filterMode to graph edges & degree metrics
        if (isTagFilter && !(r.tags || []).includes(targetTag)) return;
        if (filterMode === 'score2' && r.score !== 2) return;
        if (filterMode === 'score1' && r.score !== 1) return;
        if (filterMode === 'score1plus' && r.score < 1) return;
        if (filterMode === 'scoreNeg1' && r.score !== -1) return;
        if (filterMode === 'scoreNeg2' && r.score !== -2) return;
        if (filterMode === 'negative' && r.score > -1) return;

        if (r.score >= 1) {
          chosePos[fromId].add(r.targetId);
          chosenByPos[r.targetId].add(fromId);
          posInTotalCount[r.targetId] += r.score;
          posEdgeMap.set(key, {
            weight: r.score,
            maxScore: r.score,
            minScore: r.score,
            tags: r.tags || [],
            questionIds: r.score === 2 ? ['q1'] : ['q2'],
          });
        } else if (r.score <= -1) {
          choseNeg[fromId].add(r.targetId);
          chosenByNeg[r.targetId].add(fromId);
          negEdgeMap.set(key, {
            weight: Math.abs(r.score),
            maxScore: r.score,
            minScore: r.score,
            tags: r.tags || [],
            questionIds: ['q4'],
          });
        }
      });
    } else {
      // Fallback for legacy nomination-only responses
      resp.answers.forEach((ans) => {
        const isClosenessFilter =
          filterMode === 'all' ||
          filterMode === 'score2' ||
          filterMode === 'score1' ||
          filterMode === 'score1plus' ||
          filterMode === 'scoreNeg1' ||
          filterMode === 'scoreNeg2' ||
          filterMode === 'negative';

        if (!isClosenessFilter && !isTagFilter && ans.questionId !== filterMode) {
          return;
        }
        if (
          (filterMode === 'negative' || filterMode === 'scoreNeg1' || filterMode === 'scoreNeg2') &&
          ans.category !== 'negative'
        ) {
          return;
        }
        if (
          (filterMode === 'score2' || filterMode === 'score1' || filterMode === 'score1plus') &&
          ans.category !== 'positive'
        ) {
          return;
        }
        if (isTagFilter) return;

        const uniqueTargets = Array.from(new Set(ans.selectedIds)).filter(
          (targetId) => targetId !== fromId && studentIdSet.has(targetId)
        );
        uniqueTargets.forEach((targetId) => {
          const key = `${fromId}__${targetId}`;
          if (ans.category === 'positive') {
            chosePos[fromId].add(targetId);
            chosenByPos[targetId].add(fromId);
            posInTotalCount[targetId] += 1;
            const prev = posEdgeMap.get(key) || {
              weight: 0,
              maxScore: 1,
              minScore: 1,
              tags: [],
              questionIds: [],
            };
            prev.weight += 1;
            if (!prev.questionIds.includes(ans.questionId)) {
              prev.questionIds.push(ans.questionId);
            }
            posEdgeMap.set(key, prev);
          } else {
            choseNeg[fromId].add(targetId);
            chosenByNeg[targetId].add(fromId);
            const prev = negEdgeMap.get(key) || {
              weight: 0,
              maxScore: -1,
              minScore: -1,
              tags: [],
              questionIds: [],
            };
            prev.weight += 1;
            if (!prev.questionIds.includes(ans.questionId)) {
              prev.questionIds.push(ans.questionId);
            }
            negEdgeMap.set(key, prev);
          }
        });
      });
    }
  });

  // Build graph edges combining mutual positive pairs
  const edges: SociogramEdge[] = [];
  const handledMutual = new Set<string>();
  let totalPositiveDirected = 0;
  let mutualDirectedCount = 0;

  posEdgeMap.forEach((info, key) => {
    const [source, target] = key.split('__');
    totalPositiveDirected += 1;
    const reverseKey = `${target}__${source}`;
    const reverse = posEdgeMap.get(reverseKey);

    if (reverse) {
      mutualDirectedCount += 1;
      const pairKey = source < target ? `${source}__${target}` : `${target}__${source}`;
      if (!handledMutual.has(pairKey)) {
        handledMutual.add(pairKey);
        edges.push({
          source,
          target,
          type: 'mutual',
          weight: info.weight + reverse.weight,
          maxScore: Math.max(info.maxScore, reverse.maxScore),
          minScore: Math.min(info.minScore, reverse.minScore),
          tags: Array.from(new Set([...info.tags, ...reverse.tags])),
          questionIds: Array.from(new Set([...info.questionIds, ...reverse.questionIds])),
        });
      }
    } else {
      edges.push({
        source,
        target,
        type: 'positive',
        weight: info.weight,
        maxScore: info.maxScore,
        minScore: info.minScore,
        tags: info.tags,
        questionIds: info.questionIds,
      });
    }
  });

  negEdgeMap.forEach((info, key) => {
    const [source, target] = key.split('__');
    edges.push({
      source,
      target,
      type: 'negative',
      weight: info.weight,
      maxScore: info.maxScore,
      minScore: info.minScore,
      tags: info.tags,
      questionIds: info.questionIds,
    });
  });

  // Pairwise analysis: Asymmetric temperature gaps + Closeness Pair Tiers
  const asymmetricPairs: AsymmetricPair[] = [];
  const bestMutualPairs: ClosenessPairSummary[] = [];
  const friendlyMutualPairs: ClosenessPairSummary[] = [];
  const conflictPairs: ClosenessPairSummary[] = [];
  const bestFriendsByStudent: Record<string, Set<string>> = {};
  const mutualConflictsByStudent: Record<string, Set<string>> = {};

  sortedStudents.forEach((s) => {
    bestFriendsByStudent[s.id] = new Set();
    mutualConflictsByStudent[s.id] = new Set();
  });

  const checkedPairs = new Set<string>();
  pairScoreMap.forEach((valA, keyA) => {
    const [fromId, toId] = keyA.split('__');
    const pairKey = fromId < toId ? `${fromId}__${toId}` : `${toId}__${fromId}`;
    if (checkedPairs.has(pairKey)) return;
    checkedPairs.add(pairKey);

    const valB = pairScoreMap.get(`${toId}__${fromId}`);
    const combinedTags = Array.from(new Set([...valA.tags, ...(valB?.tags || [])]));

    if (valB) {
      // Mutual +2 best friends
      if (valA.score === 2 && valB.score === 2) {
        bestFriendsByStudent[fromId].add(toId);
        bestFriendsByStudent[toId].add(fromId);
        bestMutualPairs.push({
          aId: fromId,
          bId: toId,
          scoreAB: valA.score,
          scoreBA: valB.score,
          tags: combinedTags,
          category: 'best_mutual',
        });
      } else if (valA.score >= 1 && valB.score >= 1) {
        friendlyMutualPairs.push({
          aId: fromId,
          bId: toId,
          scoreAB: valA.score,
          scoreBA: valB.score,
          tags: combinedTags,
          category: 'friendly_mutual',
        });
      } else if (valA.score <= -1 && valB.score <= -1) {
        mutualConflictsByStudent[fromId].add(toId);
        mutualConflictsByStudent[toId].add(fromId);
        conflictPairs.push({
          aId: fromId,
          bId: toId,
          scoreAB: valA.score,
          scoreBA: valB.score,
          tags: combinedTags,
          category: 'mutual_conflict',
        });
      } else if (valA.score === -2 || valB.score === -2) {
        const severeFromFirst = valA.score === -2;
        conflictPairs.push({
          aId: severeFromFirst ? fromId : toId,
          bId: severeFromFirst ? toId : fromId,
          scoreAB: severeFromFirst ? valA.score : valB.score,
          scoreBA: severeFromFirst ? valB.score : valA.score,
          tags: combinedTags,
          category: 'severe_oneway_conflict',
        });
      }

      // Asymmetric Temperature-Gap Detection (|score(A->B) - score(B->A)| >= 2)
      const diff = valA.score - valB.score;
      const gap = Math.abs(diff);
      if (gap >= 2) {
        if (diff > 0) {
          asymmetricPairs.push({
            fromId,
            toId,
            scoreFromTo: valA.score,
            scoreToFrom: valB.score,
            gap,
            tagsFromTo: valA.tags,
            tagsToFrom: valB.tags,
          });
        } else {
          asymmetricPairs.push({
            fromId: toId,
            toId: fromId,
            scoreFromTo: valB.score,
            scoreToFrom: valA.score,
            gap,
            tagsFromTo: valB.tags,
            tagsToFrom: valA.tags,
          });
        }
      }
    } else if (valA.score === -2) {
      // One-way severe conflict where target has not responded yet
      conflictPairs.push({
        aId: fromId,
        bId: toId,
        scoreAB: valA.score,
        scoreBA: null,
        tags: valA.tags,
        category: 'severe_oneway_conflict',
      });
    }
  });

  asymmetricPairs.sort((a, b) => b.gap - a.gap || b.scoreFromTo - a.scoreFromTo);
  conflictPairs.sort((a, b) => {
    const rank = (c: ClosenessPairSummary['category']) => (c === 'mutual_conflict' ? 2 : 1);
    return rank(b.category) - rank(a.category) || (a.scoreAB + (a.scoreBA ?? 0)) - (b.scoreAB + (b.scoreBA ?? 0));
  });

  const tagStats = Array.from(globalTagStatsMap.values()).sort(
    (a, b) => b.totalCount - a.totalCount || b.strongCount - a.strongCount
  );

  const closenessSummary: ClosenessAnalyticsSummary = {
    totalRatingsCount,
    classAvgCloseness:
      totalRatingsCount > 0 ? Number((totalRatingsSum / totalRatingsCount).toFixed(2)) : null,
    distribution: classDistribution,
    bestMutualPairs,
    friendlyMutualPairs,
    conflictPairs,
    tagStats,
  };

  // Compute Z-scores for sociometric classification
  const n = sortedStudents.length;
  const respondedCount = responseMap.size;
  const posInArr = sortedStudents.map((s) => chosenByPos[s.id].size);
  const negInArr = sortedStudents.map((s) => chosenByNeg[s.id].size);

  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const std = (arr: number[], m: number) => {
    if (arr.length <= 1) return 1;
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length;
    return Math.sqrt(variance) || 1;
  };

  const posMean = mean(posInArr);
  const posStd = std(posInArr, posMean);
  const negMean = mean(negInArr);
  const negStd = std(negInArr, negMean);

  const typeCounts: Record<SociometricType, number> = {
    인기형: 0,
    평균형: 0,
    '고립·관심형': 0,
    '갈등·주의형': 0,
    양면형: 0,
    미분류: 0,
  };

  const sortTags = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

  // Pre-compute normalization factors for Belonging, Influence, and Bridge indices
  const maxPosInTotal = Math.max(4, ...sortedStudents.map((s) => posInTotalCount[s.id] || 0));
  const twoHopPrestigeRaw: Record<string, number> = {};
  sortedStudents.forEach((s) => {
    let sum = 0;
    chosenByPos[s.id].forEach((chooserId) => {
      sum += 1 + chosenByPos[chooserId].size * 0.65 + veryCloseInCount[chooserId] * 0.35;
    });
    twoHopPrestigeRaw[s.id] = sum;
  });
  const maxTwoHop = Math.max(3, ...Object.values(twoHopPrestigeRaw));

  const studentById: Record<string, Student> = {};
  sortedStudents.forEach((s) => {
    studentById[s.id] = s;
  });

  const hasPositiveTie = (a: string, b: string) =>
    chosePos[a]?.has(b) || chosePos[b]?.has(a);

  const metricsById: Record<string, StudentMetrics> = {};
  const metricsList: StudentMetrics[] = [];

  sortedStudents.forEach((student) => {
    const posIn = chosenByPos[student.id].size;
    const posOut = chosePos[student.id].size;
    const negIn = chosenByNeg[student.id].size;
    const negOut = choseNeg[student.id].size;
    const mutualIds = Array.from(chosePos[student.id]).filter((id) =>
      chosenByPos[student.id].has(id)
    );
    const bestFriendPairIds = Array.from(bestFriendsByStudent[student.id]);
    const avgClosenessReceived =
      receivedScoreCount[student.id] > 0
        ? Number((receivedScoreSum[student.id] / receivedScoreCount[student.id]).toFixed(2))
        : null;
    const avgClosenessGiven =
      givenScoreCount[student.id] > 0
        ? Number((givenScoreSum[student.id] / givenScoreCount[student.id]).toFixed(2))
        : null;
    const closenessGap =
      avgClosenessReceived !== null && avgClosenessGiven !== null
        ? Number((avgClosenessReceived - avgClosenessGiven).toFixed(2))
        : null;

    let sociometricType: SociometricType = '미분류';
    if (respondedCount >= 3) {
      const zPos = (posIn - posMean) / posStd;
      const zNeg = (negIn - negMean) / negStd;
      const sp = zPos - zNeg;
      const si = zPos + zNeg;

      if (negIn >= 2 && (posIn <= 1 || (avgClosenessReceived !== null && avgClosenessReceived < -0.2))) {
        sociometricType = '갈등·주의형';
      } else if (posIn === 0 || (posIn === 1 && mutualIds.length === 0 && zPos < -0.7)) {
        sociometricType = '고립·관심형';
      } else if (posIn >= 3 && negIn >= 2 && si >= 0.8) {
        sociometricType = '양면형';
      } else if (sp >= 0.8 && zPos >= 0.5 && negIn <= 1) {
        sociometricType = '인기형';
      } else if (sp <= -0.8 && zNeg >= 0.8) {
        sociometricType = '갈등·주의형';
      } else if (si <= -0.9 && posIn <= 1) {
        sociometricType = '고립·관심형';
      } else {
        sociometricType = '평균형';
      }
    }

    typeCounts[sociometricType] += 1;

    // 1. Belonging Index (소속감 지수, 0-100)
    let belongingScore = 0;
    if (respondedCount > 0) {
      const possibleResponders = Math.max(1, respondedCount - (responseMap.has(student.id) ? 1 : 0));
      const mutualComponent = Math.min(48, mutualIds.length * 15 + bestFriendPairIds.length * 6);
      const acceptanceTarget = Math.max(2, Math.min(5, possibleResponders * 0.35));
      const acceptanceComponent = Math.min(36, (posIn / acceptanceTarget) * 36);
      const outgoingComponent = Math.min(16, (posOut / Math.max(2, Math.min(4, n - 1))) * 16);
      const conflictPenalty = Math.min(
        30,
        negIn * 7 + (receivedCountsMap[student.id][-2] || 0) * 5
      );
      belongingScore = Math.max(
        0,
        Math.min(100, Math.round(mutualComponent + acceptanceComponent + outgoingComponent - conflictPenalty))
      );
    }

    // 2. Influence Index (영향력 지수, 0-100)
    let influenceScore = 0;
    if (respondedCount > 0) {
      const directStrength = (posInTotalCount[student.id] / maxPosInTotal) * 54;
      const twoHopPrestige = (twoHopPrestigeRaw[student.id] / maxTwoHop) * 31;
      const veryCloseBonus = Math.min(15, veryCloseInCount[student.id] * 4);
      let rawInfluence = directStrength + twoHopPrestige + veryCloseBonus;
      if (avgClosenessReceived !== null && avgClosenessReceived < -0.1) {
        rawInfluence *= 0.82;
      }
      influenceScore = Math.max(0, Math.min(100, Math.round(rawInfluence)));
    }

    // 3. Bridge Index (가교 역할 지수, 0-100)
    let bridgeScore = 0;
    if (respondedCount > 0) {
      const posNeighborSet = new Set<string>([
        ...Array.from(chosenByPos[student.id]),
        ...Array.from(chosePos[student.id]),
      ]);
      const neighbors = Array.from(posNeighborSet);
      if (neighbors.length >= 2) {
        let totalPairs = 0;
        let unconnectedPairs = 0;
        for (let i = 0; i < neighbors.length; i++) {
          for (let j = i + 1; j < neighbors.length; j++) {
            totalPairs += 1;
            if (!hasPositiveTie(neighbors[i], neighbors[j])) {
              unconnectedPairs += 1;
            }
          }
        }
        const brokerageRatio = totalPairs > 0 ? unconnectedPairs / totalPairs : 0;
        const degreeWeight = Math.min(1, neighbors.length / 4);
        const oppositeGenderMutual = mutualIds.filter(
          (nid) => studentById[nid] && studentById[nid].gender !== student.gender
        ).length;
        const oppositeGenderAny = neighbors.filter(
          (nid) => studentById[nid] && studentById[nid].gender !== student.gender
        ).length;
        const crossGenderBonus = Math.min(35, oppositeGenderMutual * 22 + oppositeGenderAny * 8);
        bridgeScore = Math.max(
          0,
          Math.min(100, Math.round(brokerageRatio * degreeWeight * 65 + crossGenderBonus))
        );
      }
    }

    // 4. Isolation Risk Level (고립 위험도)
    let isolationRisk: IsolationRiskLevel = '안정';
    if (respondedCount >= 2) {
      if (
        posIn === 0 ||
        (mutualIds.length === 0 && posIn <= 1) ||
        belongingScore < 28
      ) {
        isolationRisk = '높음';
      } else if (
        belongingScore < 48 ||
        sociometricType === '고립·관심형' ||
        sociometricType === '갈등·주의형' ||
        (mutualIds.length === 0 && posIn <= 2)
      ) {
        isolationRisk = '주의';
      }
    }

    const metric: StudentMetrics = {
      student,
      responded: responseMap.has(student.id),
      positiveIn: posIn,
      positiveInTotal: posInTotalCount[student.id],
      veryCloseIn: veryCloseInCount[student.id],
      positiveOut: posOut,
      negativeIn: negIn,
      negativeOut: negOut,
      avgClosenessReceived,
      avgClosenessGiven,
      closenessGap,
      receivedScoreCounts: receivedCountsMap[student.id],
      givenScoreCounts: givenCountsMap[student.id],
      mutualIds,
      bestFriendPairIds,
      mutualConflictIds: Array.from(mutualConflictsByStudent[student.id]),
      chosenByPositive: Array.from(chosenByPos[student.id]),
      chosePositive: Array.from(chosePos[student.id]),
      chosenByNegative: Array.from(chosenByNeg[student.id]),
      choseNegative: Array.from(choseNeg[student.id]),
      topPositiveTags: sortTags(posTagCounts[student.id]),
      topNegativeTags: sortTags(negTagCounts[student.id]),
      sociometricType,
      teacherNote: responseMap.get(student.id)?.teacherNote || '',
      belongingScore,
      influenceScore,
      bridgeScore,
      isolationRisk,
      recommendedPeerIds: [],
    };

    metricsById[student.id] = metric;
    metricsList.push(metric);
  });

  // Compute recommended supportive/bridge peers for each student (especially useful for isolated students)
  metricsList.forEach((m) => {
    const candidates = metricsList
      .filter((other) => other.student.id !== m.student.id)
      .map((other) => {
        const hasConflict =
          chosenByNeg[m.student.id].has(other.student.id) ||
          choseNeg[m.student.id].has(other.student.id);
        if (hasConflict) return { id: other.student.id, score: -100 };

        const recFromOther = pairScoreMap.get(`${other.student.id}__${m.student.id}`)?.score ?? 0;
        const givenToOther = pairScoreMap.get(`${m.student.id}__${other.student.id}`)?.score ?? 0;

        let score = 0;
        if (recFromOther === 2) score += 42;
        else if (recFromOther === 1) score += 28;
        if (givenToOther === 2) score += 22;
        else if (givenToOther === 1) score += 12;
        score += other.bridgeScore * 0.25 + other.influenceScore * 0.15;
        if (other.sociometricType === '갈등·주의형') score -= 25;
        return { id: other.student.id, score };
      })
      .filter((c) => c.score >= 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((c) => c.id);

    m.recommendedPeerIds = candidates;
  });

  const attentionStudents = metricsList
    .filter(
      (m) =>
        m.sociometricType === '고립·관심형' ||
        m.sociometricType === '갈등·주의형' ||
        m.sociometricType === '양면형'
    )
    .sort((a, b) => {
      const score = (x: StudentMetrics) =>
        (x.sociometricType === '갈등·주의형' ? 3 : x.sociometricType === '고립·관심형' ? 2 : 1) * 10 +
        x.negativeIn * 2 -
        x.positiveIn;
      return score(b) - score(a);
    });

  // Build Automated Classroom Sociometry Summary Report
  const possibleDirectedPairs = n > 1 ? respondedCount * (n - 1) : 1;
  const networkDensity =
    respondedCount > 0 && n > 1
      ? Math.min(100, Math.round((totalPositiveDirected / possibleDirectedPairs) * 100))
      : 0;

  const classAvgBelonging =
    n > 0 ? Math.round(metricsList.reduce((acc, m) => acc + m.belongingScore, 0) / n) : 0;
  const classAvgInfluence =
    n > 0 ? Math.round(metricsList.reduce((acc, m) => acc + m.influenceScore, 0) / n) : 0;

  // Influence concentration (check top 20% share of weighted positive in-degree)
  const totalWeightedPos = metricsList.reduce((acc, m) => acc + m.positiveInTotal, 0);
  const sortedByWeightedPos = [...metricsList].sort(
    (a, b) => b.positiveInTotal - a.positiveInTotal
  );
  const topSliceCount = Math.max(1, Math.ceil(n * 0.2));
  const topSliceSum = sortedByWeightedPos
    .slice(0, topSliceCount)
    .reduce((acc, m) => acc + m.positiveInTotal, 0);
  const topShare = totalWeightedPos > 0 ? topSliceSum / totalWeightedPos : 0;
  const influenceConcentration: SociometryReportSummary['influenceConcentration'] =
    topShare >= 0.48 ? '소수 집중' : topShare >= 0.34 ? '보통' : '균형';

  // Cluster count using mutual ties
  const tempClusters = detectFriendClustersFromMetrics(metricsList, metricsById);
  const clusteredSet = new Set<string>();
  tempClusters.forEach((c) => c.memberIds.forEach((id) => clusteredSet.add(id)));
  const unclusteredCount = Math.max(0, n - clusteredSet.size);

  const topInfluencers = [...metricsList]
    .filter((m) => m.influenceScore >= 45 && m.positiveIn >= 2)
    .sort((a, b) => b.influenceScore - a.influenceScore || b.positiveInTotal - a.positiveInTotal)
    .slice(0, 4);

  const highBelongingStudents = [...metricsList]
    .filter((m) => m.belongingScore >= 65)
    .sort((a, b) => b.belongingScore - a.belongingScore)
    .slice(0, 4);

  const bridgeStudents = [...metricsList]
    .filter((m) => m.bridgeScore >= 35 && m.positiveIn >= 2)
    .sort((a, b) => b.bridgeScore - a.bridgeScore || b.influenceScore - a.influenceScore)
    .slice(0, 4);

  const isolatedStudents = [...metricsList]
    .filter((m) => m.isolationRisk === '높음' || m.sociometricType === '고립·관심형')
    .sort((a, b) => a.belongingScore - b.belongingScore || a.positiveIn - b.positiveIn);

  const conflictRiskStudents = [...metricsList]
    .filter(
      (m) =>
        m.sociometricType === '갈등·주의형' ||
        m.negativeIn >= 2 ||
        m.receivedScoreCounts[-2] >= 2
    )
    .sort(
      (a, b) =>
        b.receivedScoreCounts[-2] * 2 +
        b.negativeIn -
        (a.receivedScoreCounts[-2] * 2 + a.negativeIn)
    );

  const reciprocityRate =
    totalPositiveDirected > 0 ? Math.round((mutualDirectedCount / totalPositiveDirected) * 100) : 0;

  const findings: ReportFinding[] = [];
  const recommendations: ReportRecommendation[] = [];

  if (respondedCount >= 2) {
    // Finding 1: Overall Cohesion & Belonging
    if (classAvgBelonging >= 62 && reciprocityRate >= 55) {
      findings.push({
        id: 'cohesion_strong',
        severity: '긍정',
        title: `안정적인 학급 소속감과 상호 유대 (평균 소속감 ${classAvgBelonging}점 · 호혜율 ${reciprocityRate}%)`,
        detail: `전체 긍정 선택 중 ${reciprocityRate}%가 상호 선택으로 이어졌으며 핵심 단짝(+2↔+2) ${bestMutualPairs.length}쌍이 형성되어 학급 내 정서적 안정감이 양호합니다.`,
      });
    } else if (classAvgBelonging >= 42) {
      findings.push({
        id: 'cohesion_mid',
        severity: '관찰',
        title: `보통 수준의 학급 소속감 (평균 ${classAvgBelonging}점 · 연결 밀도 ${networkDensity}%)`,
        detail: `상호 선택 비율은 ${reciprocityRate}%이며, 일부 학생은 특정 소그룹에 집중되고 주변부 학생과의 연결이 얕은 편입니다.`,
      });
    } else {
      findings.push({
        id: 'cohesion_low',
        severity: '주의',
        title: `학급 전반의 소속감·상호 유대 강화 필요 (평균 소속감 ${classAvgBelonging}점)`,
        detail: `긍정 연결 밀도가 ${networkDensity}%, 호혜율이 ${reciprocityRate}%로 낮아 학급 단위 공동체 활동과 협력 프로젝트가 권장됩니다.`,
      });
    }

    // Finding 2: Isolated students
    if (isolatedStudents.length > 0) {
      const names = isolatedStudents
        .slice(0, 4)
        .map((m) => `${m.student.number}번 ${m.student.name}`)
        .join(', ');
      findings.push({
        id: 'isolated_alert',
        severity: '주의',
        title: `고립·소속감 저하 학생 ${isolatedStudents.length}명 감지`,
        detail: `${names}${isolatedStudents.length > 4 ? ` 외 ${isolatedStudents.length - 4}명` : ''} 학생은 상호 친구가 없거나 받은 친밀도가 낮아 또래 관계망에서 주변부에 위치해 있습니다.`,
      });

      isolatedStudents.slice(0, 3).forEach((iso) => {
        const partnerNames = iso.recommendedPeerIds
          .map((pid) => metricsById[pid])
          .filter(Boolean)
          .map((pm) => `${pm.student.number}번 ${pm.student.name}`);

        recommendations.push({
          id: `rec_iso_${iso.student.id}`,
          priority: '우선',
          title: `${iso.student.number}번 ${iso.student.name} 학생 소속감 회복 지원`,
          detail:
            partnerNames.length > 0
              ? `소속감 지수 ${iso.belongingScore}점(상호 친구 ${iso.mutualIds.length}명)입니다. 긍정 접점 또는 가교 성향이 높은 ${partnerNames.join(', ')} 학생과 모둠·짝 활동을 우선 배정해 자연스러운 교류를 유도해 보세요.`
              : `소속감 지수 ${iso.belongingScore}점으로 또래 접점이 매우 적습니다. 개별 면담을 통해 관심사를 파악하고 소규모 협력 역할(모둠 서기·준비물 담당 등)을 부여해 보세요.`,
          targetStudentIds: [iso.student.id, ...iso.recommendedPeerIds],
        });
      });
    } else {
      findings.push({
        id: 'isolated_none',
        severity: '긍정',
        title: '고립 위험군 학생이 발견되지 않았습니다',
        detail: '대부분의 학생이 최소 1명 이상의 또래와 긍정적인 관계를 유지하고 있습니다.',
      });
    }

    // Finding 3: Conflict pairs / conflict risk students
    if (conflictPairs.length > 0 || conflictRiskStudents.length > 0) {
      const topConflictNames = conflictRiskStudents
        .slice(0, 3)
        .map((m) => `${m.student.number}번 ${m.student.name}(불편·어색 ${m.negativeIn}건)`)
        .join(', ');
      const topNegTag = tagStats.find((t) => t.category === 'negative');
      findings.push({
        id: 'conflict_alert',
        severity: '주의',
        title: `갈등·불편(-2 포함) 관계 쌍 ${conflictPairs.length}건 감지`,
        detail: `${topConflictNames ? `${topConflictNames} 중심으로 ` : ''}관계 마찰이 확인되었습니다.${topNegTag ? ` 가장 빈번한 갈등 요인은 #${topNegTag.tag}(${topNegTag.totalCount}건)입니다.` : ''}`,
      });

      if (conflictRiskStudents.length > 0) {
        const focusConflict = conflictRiskStudents[0];
        recommendations.push({
          id: `rec_conflict_${focusConflict.student.id}`,
          priority: '우선',
          title: `${focusConflict.student.number}번 ${focusConflict.student.name} 중심 갈등 중재 및 자리 분리`,
          detail: `불편함(-2) ${focusConflict.receivedScoreCounts[-2]}건 포함 총 ${focusConflict.negativeIn}명의 친구로부터 부정 평가를 받았습니다. 직접 갈등 쌍은 모둠·자리를 분리하되, 학생의 개별 메모를 확인해 중재 상담을 진행해 주세요.`,
          targetStudentIds: [focusConflict.student.id],
        });
      }
    }

    // Finding 4: Influence & Bridge Structure
    if (topInfluencers.length > 0 || bridgeStudents.length > 0) {
      const infNames = topInfluencers
        .slice(0, 3)
        .map((m) => `${m.student.number}번 ${m.student.name}(${m.influenceScore}점)`)
        .join(', ');
      const brNames = bridgeStudents
        .slice(0, 2)
        .map((m) => `${m.student.number}번 ${m.student.name}`)
        .join(', ');
      findings.push({
        id: 'influence_structure',
        severity: influenceConcentration === '소수 집중' ? '관찰' : '긍정',
        title: `영향력 분포: ${influenceConcentration} · 또래 그룹 ${tempClusters.length}개 형성`,
        detail: `${infNames ? `핵심 영향력 학생은 ${infNames}이며` : '학급 내 영향력이 고르게 분포하며'}, ${brNames ? `${brNames} 학생이 서로 다른 또래 집단을 잇는 가교 역할을 수행하고 있습니다.` : '또래 그룹 간 교류를 늘릴 가교 활동이 유익합니다.'}`,
      });

      if (bridgeStudents.length > 0) {
        recommendations.push({
          id: 'rec_bridge_leverage',
          priority: '권장',
          title: `가교 학생(${bridgeStudents.slice(0, 2).map((m) => m.student.name).join(', ')}) 중심의 모둠 리더 배치`,
          detail: `서로 다른 또래 그룹과 두루 소통하는 가교 학생을 모둠 조장으로 배치하면 학급 내 파벌화를 예방하고 전체 네트워크 밀도(${networkDensity}%)를 효과적으로 높일 수 있습니다.`,
          targetStudentIds: bridgeStudents.slice(0, 2).map((m) => m.student.id),
        });
      }
    }

    // Finding 5: Asymmetric perception gaps
    if (asymmetricPairs.length >= 2) {
      recommendations.push({
        id: 'rec_asymmetric',
        priority: '권장',
        title: `관계 온도차 ${asymmetricPairs.length}쌍 관찰 (일방적 호감·서먹함 점검)`,
        detail: `서로 친밀도 인식이 2단계 이상 차이 나는 쌍이 ${asymmetricPairs.length}쌍 발견되었습니다. '관계 온도차' 탭에서 일방적 기대나 오해가 있는 학생을 미리 살펴봐 주세요.`,
        targetStudentIds: asymmetricPairs.slice(0, 2).flatMap((p) => [p.fromId, p.toId]),
      });
    }
  }

  const sociometryReport: SociometryReportSummary = {
    classAvgBelonging,
    classAvgInfluence,
    networkDensity,
    influenceConcentration,
    clusterCount: tempClusters.length,
    unclusteredCount,
    topInfluencers,
    highBelongingStudents,
    bridgeStudents,
    isolatedStudents,
    conflictRiskStudents,
    findings,
    recommendations,
  };

  return {
    totalStudents: n,
    respondedCount,
    responseRate: n > 0 ? Math.round((respondedCount / n) * 100) : 0,
    mutualPairCount: handledMutual.size,
    reciprocityRate,
    avgPositiveIn: n > 0 ? Number((posInArr.reduce((a, b) => a + b, 0) / n).toFixed(1)) : 0,
    attentionStudents,
    asymmetricPairs,
    closenessSummary,
    sociometryReport,
    metricsById,
    metricsList,
    edges,
    typeCounts,
  };
}

function detectFriendClustersFromMetrics(
  metricsList: StudentMetrics[],
  metricsById: Record<string, StudentMetrics>
): FriendCluster[] {
  const visited = new Set<string>();
  const clusters: FriendCluster[] = [];
  const adj: Record<string, Set<string>> = {};

  metricsList.forEach((m) => {
    adj[m.student.id] = new Set(m.mutualIds);
  });

  const sortedIds = [...metricsList]
    .sort((a, b) => b.mutualIds.length - a.mutualIds.length || a.student.number - b.student.number)
    .map((m) => m.student.id);

  let clusterIdx = 0;
  for (const startId of sortedIds) {
    if (visited.has(startId)) continue;
    const queue = [startId];
    const component: string[] = [];
    visited.add(startId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      adj[curr]?.forEach((nextId) => {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      });
    }

    if (component.length >= 2) {
      component.sort(
        (a, b) =>
          (metricsById[a]?.student.number || 0) -
          (metricsById[b]?.student.number || 0)
      );
      const letter = String.fromCharCode(65 + (clusterIdx % 26));
      clusters.push({
        id: `cluster_${clusterIdx}`,
        label: `또래 그룹 ${letter}`,
        memberIds: component,
        color: CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length],
      });
      clusterIdx += 1;
    }
  }

  return clusters;
}

export interface FriendCluster {
  id: string;
  label: string;
  memberIds: string[];
  color: string;
}

const CLUSTER_COLORS = [
  '#2563EB',
  '#059669',
  '#7C3AED',
  '#0891B2',
  '#EA580C',
  '#DB2777',
  '#4F46E5',
];

export function detectFriendClusters(analytics: ClassAnalytics): FriendCluster[] {
  const visited = new Set<string>();
  const clusters: FriendCluster[] = [];
  const adj: Record<string, Set<string>> = {};

  analytics.metricsList.forEach((m) => {
    adj[m.student.id] = new Set(m.mutualIds);
  });

  const sortedIds = [...analytics.metricsList]
    .sort((a, b) => b.mutualIds.length - a.mutualIds.length || a.student.number - b.student.number)
    .map((m) => m.student.id);

  let clusterIdx = 0;
  for (const startId of sortedIds) {
    if (visited.has(startId)) continue;
    const queue = [startId];
    const component: string[] = [];
    visited.add(startId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      adj[curr]?.forEach((nextId) => {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      });
    }

    if (component.length >= 2) {
      component.sort(
        (a, b) =>
          (analytics.metricsById[a]?.student.number || 0) -
          (analytics.metricsById[b]?.student.number || 0)
      );
      const letter = String.fromCharCode(65 + (clusterIdx % 26));
      clusters.push({
        id: `cluster_${clusterIdx}`,
        label: `또래 그룹 ${letter}`,
        memberIds: component,
        color: CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length],
      });
      clusterIdx += 1;
    }
  }

  return clusters;
}

export interface SampleClassSeed {
  students: Array<{
    docId: string;
    studentCode: string;
    number: number;
    name: string;
    gender: Gender;
    accessCode: string;
    memo: string;
  }>;
  responses: Array<{
    studentDocId: string;
    answers: SurveyAnswer[];
    peerRatings: PeerRating[];
    teacherNote: string;
  }>;
}

/**
 * Generates a realistic 16-student Korean classroom dataset with full 1:1 5-level closeness ratings,
 * conditional relationship tags, per-friend private notes, and realistic temperature gaps.
 */
export function buildSampleClassSeed(): SampleClassSeed {
  const roster: SampleClassSeed['students'] = [
    { docId: 'stu_01', studentCode: 'S01', number: 1, name: '김도윤', gender: '남', accessCode: 'K7M2P', memo: '학급 회장, 친구들과 두루 잘 어울림' },
    { docId: 'stu_02', studentCode: 'S02', number: 2, name: '이서준', gender: '남', accessCode: 'L4R8N', memo: '' },
    { docId: 'stu_03', studentCode: 'S03', number: 3, name: '박하준', gender: '남', accessCode: 'P9W3X', memo: '' },
    { docId: 'stu_04', studentCode: 'S04', number: 4, name: '최은우', gender: '남', accessCode: 'C2T6V', memo: '전학 온 지 한 달 됨 — 모둠 배정 시 세심한 관찰 필요' },
    { docId: 'stu_05', studentCode: 'S05', number: 5, name: '정시우', gender: '남', accessCode: 'J5H9B', memo: '' },
    { docId: 'stu_06', studentCode: 'S06', number: 6, name: '강지호', gender: '남', accessCode: 'G8D4K', memo: '체육 시간 규칙 갈등으로 최근 다툼 있었음' },
    { docId: 'stu_07', studentCode: 'S07', number: 7, name: '조유준', gender: '남', accessCode: 'Z3N7F', memo: '' },
    { docId: 'stu_08', studentCode: 'S08', number: 8, name: '윤건우', gender: '남', accessCode: 'Y6Q2M', memo: '' },
    { docId: 'stu_09', studentCode: 'S09', number: 9, name: '김서연', gender: '여', accessCode: 'A8K3R', memo: '남녀 모두와 소통이 원활한 가교 역할' },
    { docId: 'stu_10', studentCode: 'S10', number: 10, name: '이하윤', gender: '여', accessCode: 'E5V9T', memo: '' },
    { docId: 'stu_11', studentCode: 'S11', number: 11, name: '박지우', gender: '여', accessCode: 'B2P7W', memo: '' },
    { docId: 'stu_12', studentCode: 'S12', number: 12, name: '최서현', gender: '여', accessCode: 'H9C4L', memo: '' },
    { docId: 'stu_13', studentCode: 'S13', number: 13, name: '정민서', gender: '여', accessCode: 'M3X8D', memo: '' },
    { docId: 'stu_14', studentCode: 'S14', number: 14, name: '강하은', gender: '여', accessCode: 'N6F2J', memo: '' },
    { docId: 'stu_15', studentCode: 'S15', number: 15, name: '조예린', gender: '여', accessCode: 'R7G5Q', memo: '조용한 편, 소그룹 활동 선호' },
    { docId: 'stu_16', studentCode: 'S16', number: 16, name: '윤채원', gender: '여', accessCode: 'W4Z9Y', memo: '' },
  ];

  const allIds = roster.map((r) => r.docId);

  const buildRatings = (
    selfId: string,
    overrides: Record<string, { score: ClosenessScore; tags?: string[]; note?: string }>
  ): PeerRating[] =>
    allIds
      .filter((id) => id !== selfId)
      .map((targetId) => {
        const ov = overrides[targetId];
        return {
          targetId,
          score: ov ? ov.score : 0,
          tags: ov?.tags || [],
          note: ov?.note || '',
        };
      });

  const rawConfigs: Array<{
    studentDocId: string;
    overrides: Record<string, { score: ClosenessScore; tags?: string[]; note?: string }>;
    teacherNote: string;
  }> = [
    {
      studentDocId: 'stu_01',
      overrides: {
        stu_02: { score: 2, tags: ['고민상담', '쉬는시간·놀이', '도움·신뢰'] },
        stu_03: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_05: { score: 1, tags: ['모둠협업'] },
        stu_09: { score: 2, tags: ['모둠협업', '도움·신뢰'] },
        stu_06: { score: -2, tags: ['규칙·협업 갈등', '다툼 경험'], note: '피구 경기 규칙 때문에 자주 언성이 높아져요' },
      },
      teacherNote: '요즘 반 분위기가 좋아서 즐겁습니다. 체육 시간에 다투지 않고 즐겁게 경기했으면 좋겠어요.',
    },
    {
      studentDocId: 'stu_02',
      overrides: {
        stu_01: { score: 2, tags: ['고민상담', '도움·신뢰'] },
        stu_03: { score: 2, tags: ['쉬는시간·놀이', '같이 있으면 편함'] },
        stu_05: { score: 1, tags: ['모둠협업', '쉬는시간·놀이'] },
        stu_06: { score: -2, tags: ['말투·장난이 힘듦', '다툼 경험'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_03',
      overrides: {
        stu_01: { score: 2, tags: ['쉬는시간·놀이', '도움·신뢰'] },
        stu_02: { score: 2, tags: ['성격이 잘 맞음', '같이 있으면 편함'] },
        stu_07: { score: 1, tags: ['쉬는시간·놀이'] },
        stu_04: { score: -1, tags: ['다가가기 어려움'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_04',
      overrides: {
        stu_01: { score: 2, tags: ['도움·신뢰', '같이 있으면 편함'], note: '전학 왔을 때 교실 안내해 줘서 고마웠어요' },
        stu_09: { score: 2, tags: ['도움·신뢰', '모둠협업'] },
        stu_05: { score: 1, tags: ['모둠협업'] },
        stu_06: { score: -1, tags: ['말투·장난이 힘듦'] },
      },
      teacherNote: '전학 온 지 얼마 안 돼서 아직 친한 친구가 많지 않아요. 도윤이랑 서연이가 잘 챙겨줘서 고마워요.',
    },
    {
      studentDocId: 'stu_05',
      overrides: {
        stu_01: { score: 1, tags: ['모둠협업', '도움·신뢰'] },
        stu_02: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_07: { score: 2, tags: ['쉬는시간·놀이', '같이 있으면 편함'] },
        stu_08: { score: 1, tags: ['쉬는시간·놀이'] },
        stu_06: { score: -2, tags: ['규칙·협업 갈등', '말투·장난이 힘듦'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_06',
      overrides: {
        stu_07: { score: 2, tags: ['쉬는시간·놀이', '같이 있으면 편함'] },
        stu_08: { score: 1, tags: ['쉬는시간·놀이'] },
        stu_01: { score: 1, tags: ['도움·신뢰'] },
        stu_02: { score: -2, tags: ['다툼 경험', '소외·무시 느낌'], note: '피구할 때 계속 저한테만 뭐라고 해요' },
        stu_05: { score: -2, tags: ['다툼 경험', '규칙·협업 갈등'] },
      },
      teacherNote: '피구할 때 애들이 저한테만 뭐라고 해서 속상했어요.',
    },
    {
      studentDocId: 'stu_07',
      overrides: {
        stu_03: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_05: { score: 2, tags: ['고민상담', '쉬는시간·놀이'] },
        stu_06: { score: 1, tags: ['쉬는시간·놀이'], note: '둘이 있을 땐 착한데 경기할 때만 흥분해요' },
        stu_01: { score: 1, tags: ['도움·신뢰'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_09',
      overrides: {
        stu_10: { score: 2, tags: ['고민상담', '같이 있으면 편함'] },
        stu_11: { score: 2, tags: ['쉬는시간·놀이', '도움·신뢰'] },
        stu_01: { score: 2, tags: ['모둠협업', '도움·신뢰'] },
        stu_12: { score: 1, tags: ['모둠협업'] },
        stu_04: { score: 1, tags: ['모둠협업'] },
      },
      teacherNote: '다음 모둠 활동 때는 은우랑 같은 모둠 해보고 싶어요.',
    },
    {
      studentDocId: 'stu_10',
      overrides: {
        stu_09: { score: 2, tags: ['고민상담', '도움·신뢰'] },
        stu_11: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_12: { score: 1, tags: ['모둠협업', '같이 있으면 편함'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_11',
      overrides: {
        stu_09: { score: 2, tags: ['고민상담', '도움·신뢰'] },
        stu_10: { score: 2, tags: ['쉬는시간·놀이', '같이 있으면 편함'] },
        stu_13: { score: 1, tags: ['모둠협업'] },
        stu_06: { score: -1, tags: ['말투·장난이 힘듦'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_12',
      overrides: {
        stu_10: { score: 2, tags: ['고민상담', '같이 있으면 편함'] },
        stu_13: { score: 2, tags: ['모둠협업', '도움·신뢰'] },
        stu_14: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_09: { score: 1, tags: ['모둠협업'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_13',
      overrides: {
        stu_12: { score: 2, tags: ['고민상담', '모둠협업'] },
        stu_14: { score: 2, tags: ['쉬는시간·놀이', '같이 있으면 편함'] },
        stu_11: { score: 1, tags: ['도움·신뢰'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_14',
      overrides: {
        stu_12: { score: 2, tags: ['쉬는시간·놀이', '성격이 잘 맞음'] },
        stu_13: { score: 2, tags: ['고민상담', '도움·신뢰'] },
        stu_15: { score: 2, tags: ['같이 있으면 편함', '모둠협업'] },
      },
      teacherNote: '',
    },
    {
      studentDocId: 'stu_15',
      overrides: {
        stu_14: { score: 2, tags: ['고민상담', '같이 있으면 편함', '도움·신뢰'] },
        stu_16: { score: 1, tags: ['같이 있으면 편함'] },
        stu_09: { score: 1, tags: ['모둠협업'] },
      },
      teacherNote: '하은이랑 짝이 되어서 편해요.',
    },
  ];

  const defaultQMeta = [
    { id: 'q1', category: 'positive' as const },
    { id: 'q2', category: 'positive' as const },
    { id: 'q3', category: 'positive' as const },
    { id: 'q4', category: 'negative' as const },
  ];

  const responses: SampleClassSeed['responses'] = rawConfigs.map((cfg) => {
    const peerRatings = buildRatings(cfg.studentDocId, cfg.overrides);
    const answers = deriveAnswersFromPeerRatings(peerRatings, defaultQMeta);
    return {
      studentDocId: cfg.studentDocId,
      answers,
      peerRatings,
      teacherNote: cfg.teacherNote,
    };
  });

  return { students: roster, responses };
}
