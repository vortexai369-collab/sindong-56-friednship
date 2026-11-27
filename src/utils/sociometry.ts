import {
  ClassAnalytics,
  Gender,
  SociogramEdge,
  SociometricType,
  Student,
  StudentMetrics,
  SurveyAnswer,
  SurveyResponse,
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

export interface ParsedRosterRow {
  studentCode: string;
  number: number;
  name: string;
  gender: Gender;
  accessCode: string;
  status: '미응답' | '응답완료';
}

/**
 * Parses CSV or Google Sheets / Excel TSV pasted text supporting:
 * - Exact 7942 header: 학생ID,번호,이름,성별,코드,상태
 * - Compact roster: 번호,이름,성별 (auto-generates 학생ID and 코드)
 */
export function parseRosterText(rawText: string, existingCodes: Set<string> = new Set()): ParsedRosterRow[] {
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

  // Detect header row
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
      // Matches 학생ID,번호,이름,성별,코드,상태 without header
      studentCode = cols[0];
      num = parseInt(cols[1], 10) || rowIdx + 1;
      name = cols[2] || '';
      genderRaw = cols[3] || '남';
      codeRaw = cols[4] || '';
      statusRaw = cols[5] || '미응답';
    } else if (cols.length >= 2 && /^\d+$/.test(cols[0])) {
      // 번호,이름,성별,코드
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
      genderRaw.includes('여') || genderRaw.toUpperCase() === 'F' || genderRaw.toUpperCase() === 'FEMALE'
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

/**
 * Exports roster strictly matching the attached Google Sheet columns:
 * 학생ID,번호,이름,성별,코드,상태
 */
export function exportRosterToCsv(
  students: Student[],
  respondedIds: Set<string>
): string {
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
    '학생ID,번호,이름,성별,응답상태,긍정지명받음,긍정지명함,상호친구수,갈등지명받음,교우관계유형,교사메모';
  const rows = [...analytics.metricsList]
    .sort((a, b) => a.student.number - b.student.number)
    .map((m) => {
      const esc = (v: string) => (v.includes(',') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
      return [
        m.student.studentCode,
        m.student.number,
        esc(m.student.name),
        m.student.gender,
        m.responded ? '응답완료' : '미응답',
        m.positiveIn,
        m.positiveOut,
        m.mutualIds.length,
        m.negativeIn,
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

/**
 * Computes complete classroom sociometry metrics, directed/mutual graph edges,
 * and Coie & Dodge sociometric status classifications.
 */
export function computeClassAnalytics(
  students: Student[],
  responses: SurveyResponse[],
  filterQuestionId: string = 'all'
): ClassAnalytics {
  const sortedStudents = [...students].sort((a, b) => a.number - b.number);
  const studentIdSet = new Set(sortedStudents.map((s) => s.id));
  const responseMap = new Map<string, SurveyResponse>();
  responses.forEach((r) => {
    if (studentIdSet.has(r.studentDocId)) {
      responseMap.set(r.studentDocId, r);
    }
  });

  // Track directed edges
  // key = `${fromId}__${toId}`
  const posEdgeMap = new Map<string, { weight: number; questionIds: string[] }>();
  const negEdgeMap = new Map<string, { weight: number; questionIds: string[] }>();

  const chosenByPos: Record<string, Set<string>> = {};
  const chosePos: Record<string, Set<string>> = {};
  const posInTotalCount: Record<string, number> = {};
  const chosenByNeg: Record<string, Set<string>> = {};
  const choseNeg: Record<string, Set<string>> = {};

  sortedStudents.forEach((s) => {
    chosenByPos[s.id] = new Set();
    chosePos[s.id] = new Set();
    posInTotalCount[s.id] = 0;
    chosenByNeg[s.id] = new Set();
    choseNeg[s.id] = new Set();
  });

  responseMap.forEach((resp, fromId) => {
    resp.answers.forEach((ans) => {
      if (filterQuestionId !== 'all' && ans.questionId !== filterQuestionId) {
        return;
      }
      const uniqueTargets = Array.from(new Set(ans.selectedIds)).filter(
        (targetId) => targetId !== fromId && studentIdSet.has(targetId)
      );
      uniqueTargets.forEach((targetId) => {
        const key = `${fromId}__${targetId}`;
        if (ans.category === 'positive') {
          chosePos[fromId].add(targetId);
          chosenByPos[targetId].add(fromId);
          posInTotalCount[targetId] += 1;
          const prev = posEdgeMap.get(key) || { weight: 0, questionIds: [] };
          prev.weight += 1;
          if (!prev.questionIds.includes(ans.questionId)) {
            prev.questionIds.push(ans.questionId);
          }
          posEdgeMap.set(key, prev);
        } else {
          choseNeg[fromId].add(targetId);
          chosenByNeg[targetId].add(fromId);
          const prev = negEdgeMap.get(key) || { weight: 0, questionIds: [] };
          prev.weight += 1;
          if (!prev.questionIds.includes(ans.questionId)) {
            prev.questionIds.push(ans.questionId);
          }
          negEdgeMap.set(key, prev);
        }
      });
    });
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
        const mergedQs = Array.from(new Set([...info.questionIds, ...reverse.questionIds]));
        edges.push({
          source,
          target,
          type: 'mutual',
          weight: info.weight + reverse.weight,
          questionIds: mergedQs,
        });
      }
    } else {
      edges.push({
        source,
        target,
        type: 'positive',
        weight: info.weight,
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
      questionIds: info.questionIds,
    });
  });

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

    let sociometricType: SociometricType = '미분류';
    if (respondedCount >= 3) {
      const zPos = (posIn - posMean) / posStd;
      const zNeg = (negIn - negMean) / negStd;
      const sp = zPos - zNeg;
      const si = zPos + zNeg;

      if (negIn >= 2 && posIn <= 1) {
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

    const metric: StudentMetrics = {
      student,
      responded: responseMap.has(student.id),
      positiveIn: posIn,
      positiveInTotal: posInTotalCount[student.id],
      positiveOut: posOut,
      negativeIn: negIn,
      negativeOut: negOut,
      mutualIds,
      chosenByPositive: Array.from(chosenByPos[student.id]),
      chosePositive: Array.from(chosePos[student.id]),
      chosenByNegative: Array.from(chosenByNeg[student.id]),
      choseNegative: Array.from(choseNeg[student.id]),
      sociometricType,
      teacherNote: responseMap.get(student.id)?.teacherNote || '',
    };

    metricsById[student.id] = metric;
    metricsList.push(metric);
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

  return {
    totalStudents: n,
    respondedCount,
    responseRate: n > 0 ? Math.round((respondedCount / n) * 100) : 0,
    mutualPairCount: handledMutual.size,
    reciprocityRate:
      totalPositiveDirected > 0 ? Math.round((mutualDirectedCount / totalPositiveDirected) * 100) : 0,
    avgPositiveIn: n > 0 ? Number((posInArr.reduce((a, b) => a + b, 0) / n).toFixed(1)) : 0,
    attentionStudents,
    metricsById,
    metricsList,
    edges,
    typeCounts,
  };
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

/**
 * Finds connected peer subgroups (cliques/components) based on mutual positive selections.
 */
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
    teacherNote: string;
  }>;
}

/**
 * Generates a realistic 16-student Korean 5th-grade classroom dataset
 * so teachers can immediately inspect sociogram clusters, mutual pairs,
 * bridge students, isolated students, and conflict links.
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

  // 14 of 16 responded (stu_08 and stu_16 are still 미응답 so the teacher can test student survey mode!)
  const responses: SampleClassSeed['responses'] = [
    {
      studentDocId: 'stu_01',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_02', 'stu_03', 'stu_09'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_02', 'stu_05', 'stu_09'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_02', 'stu_09'] },
        { questionId: 'q4', category: 'negative', selectedIds: ['stu_06'] },
      ],
      teacherNote: '요즘 반 분위기가 좋아서 즐겁습니다. 체육 시간에 다투지 않고 즐겁게 경기했으면 좋겠어요.',
    },
    {
      studentDocId: 'stu_02',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_01', 'stu_03', 'stu_05'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_01', 'stu_03'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_01', 'stu_05'] },
        { questionId: 'q4', category: 'negative', selectedIds: ['stu_06'] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_03',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_01', 'stu_02', 'stu_07'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_01', 'stu_07'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_01', 'stu_02'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_04',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_01', 'stu_09'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_01', 'stu_05'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_09'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '전학 온 지 얼마 안 돼서 아직 친한 친구가 많지 않아요. 도윤이랑 서연이가 잘 챙겨줘서 고마워요.',
    },
    {
      studentDocId: 'stu_05',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_02', 'stu_07', 'stu_08'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_01', 'stu_07'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_01', 'stu_02'] },
        { questionId: 'q4', category: 'negative', selectedIds: ['stu_06'] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_06',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_07', 'stu_08'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_07', 'stu_03'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_01'] },
        { questionId: 'q4', category: 'negative', selectedIds: ['stu_02', 'stu_05'] },
      ],
      teacherNote: '피구할 때 애들이 저한테만 뭐라고 해서 속상했어요.',
    },
    {
      studentDocId: 'stu_07',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_03', 'stu_05', 'stu_06'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_03', 'stu_05'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_03', 'stu_01'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_09',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_10', 'stu_11', 'stu_01'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_10', 'stu_12', 'stu_01'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_10', 'stu_11'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '다음 모둠 활동 때는 은우랑 같은 모둠 해보고 싶어요.',
    },
    {
      studentDocId: 'stu_10',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_09', 'stu_11', 'stu_12'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_09', 'stu_11'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_09', 'stu_12'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_11',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_09', 'stu_10', 'stu_13'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_10', 'stu_13'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_09', 'stu_10'] },
        { questionId: 'q4', category: 'negative', selectedIds: ['stu_06'] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_12',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_10', 'stu_13', 'stu_14'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_09', 'stu_14'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_10', 'stu_13'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_13',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_11', 'stu_12', 'stu_14'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_12', 'stu_14'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_12', 'stu_11'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_14',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_12', 'stu_13', 'stu_15'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_12', 'stu_15'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_13', 'stu_12'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '',
    },
    {
      studentDocId: 'stu_15',
      answers: [
        { questionId: 'q1', category: 'positive', selectedIds: ['stu_14', 'stu_16'] },
        { questionId: 'q2', category: 'positive', selectedIds: ['stu_14', 'stu_09'] },
        { questionId: 'q3', category: 'positive', selectedIds: ['stu_14'] },
        { questionId: 'q4', category: 'negative', selectedIds: [] },
      ],
      teacherNote: '하은이랑 짝이 되어서 편해요.',
    },
  ];

  return { students: roster, responses };
}
