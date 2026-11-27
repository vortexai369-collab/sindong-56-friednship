import { Timestamp } from 'firebase/firestore';

export type Gender = '남' | '여';
export type StudentStatus = '미응답' | '응답완료';
export type SurveyStatus = 'open' | 'closed';
export type QuestionCategory = 'positive' | 'negative';
export type ClosenessScore = -2 | -1 | 0 | 1 | 2;

export const SCHEMA_LIMITS = {
  TITLE_MAX: 120,
  CLASS_NAME_MAX: 60,
  ACADEMIC_YEAR_MAX: 20,
  JOIN_CODE_MIN: 4,
  JOIN_CODE_MAX: 16,
  STUDENT_CODE_MAX: 32,
  NAME_MAX: 40,
  ACCESS_CODE_MIN: 4,
  ACCESS_CODE_MAX: 16,
  MEMO_MAX: 500,
  NOTE_MAX: 1000,
  PEER_NOTE_MAX: 200,
  QUESTION_TEXT_MAX: 200,
  MAX_QUESTIONS: 8,
  MAX_CLASSMATES: 60,
  MAX_SELECT_LIMIT: 10,
  MAX_PEER_TAGS: 6,
} as const;

export const CLOSENESS_OPTIONS: Array<{
  score: ClosenessScore;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    score: 2,
    label: '매우 친함',
    shortLabel: '매우 친함 (+2)',
    description: '가장 친하게 지내거나 속마음을 편하게 나누는 단짝이에요',
  },
  {
    score: 1,
    label: '친한 편',
    shortLabel: '친한 편 (+1)',
    description: '자주 어울리고 함께 활동하면 즐거운 친구예요',
  },
  {
    score: 0,
    label: '보통 / 잘 모름',
    shortLabel: '보통 (0)',
    description: '같은 반 친구지만 특별히 친하거나 불편하지는 않아요',
  },
  {
    score: -1,
    label: '조금 어색함',
    shortLabel: '어색함 (-1)',
    description: '아직 서먹하거나 다가가기 조금 어려운 편이에요',
  },
  {
    score: -2,
    label: '불편함 / 갈등',
    shortLabel: '불편함 (-2)',
    description: '함께 있으면 힘들거나 다툼·갈등이 있었던 친구예요',
  },
];

export const POSITIVE_RELATION_TAGS = [
  '고민상담',
  '쉬는시간·놀이',
  '모둠협업',
  '도움·신뢰',
  '성격이 잘 맞음',
  '같이 있으면 편함',
] as const;

export const NEGATIVE_RELATION_TAGS = [
  '말투·장난이 힘듦',
  '다툼 경험',
  '성격 차이',
  '규칙·협업 갈등',
  '소외·무시 느낌',
  '다가가기 어려움',
] as const;

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  schoolName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  maxSelect: number;
}

export interface Survey {
  id: string;
  ownerId: string;
  title: string;
  className: string;
  academicYear: string;
  joinCode: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
  allowTeacherNote: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Student {
  id: string;
  ownerId: string;
  surveyId: string;
  studentCode: string; // 학생ID
  number: number;      // 번호
  name: string;        // 이름
  gender: Gender;      // 성별
  accessCode: string;  // 코드
  status: StudentStatus; // 상태
  memo: string;        // 교사 비공개 메모
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ClassmateSummary {
  id: string;
  number: number;
  name: string;
  gender: Gender;
}

export interface SurveyInvite {
  id: string; // {joinCode}_{accessCode}
  ownerId: string;
  surveyId: string;
  studentDocId: string;
  studentCode: string;
  studentNumber: number;
  studentName: string;
  surveyTitle: string;
  className: string;
  surveyStatus: SurveyStatus;
  allowTeacherNote: boolean;
  questions: SurveyQuestion[];
  classmates: ClassmateSummary[];
  submitted: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SurveyAnswer {
  questionId: string;
  category: QuestionCategory;
  selectedIds: string[];
}

export interface PeerRating {
  targetId: string;
  score: ClosenessScore;
  tags: string[];
  note: string;
}

export interface SurveyResponse {
  id: string; // studentDocId
  ownerId: string;
  surveyId: string;
  studentDocId: string;
  studentCode: string;
  inviteKey: string;
  submittedByUid: string;
  answers: SurveyAnswer[];
  peerRatings?: PeerRating[];
  teacherNote: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type SociometricType =
  | '인기형'
  | '평균형'
  | '고립·관심형'
  | '갈등·주의형'
  | '양면형'
  | '미분류';

export type ClosenessScoreCounts = Record<ClosenessScore, number>;

export interface StudentMetrics {
  student: Student;
  responded: boolean;
  positiveIn: number;      // 긍정 지명받은 수 (+1/+2)
  positiveInTotal: number; // 긍정 가중 합산
  veryCloseIn: number;     // 매우 친함(+2) 받은 수
  positiveOut: number;     // 긍정 지명한 고유 학생 수
  negativeIn: number;      // 갈등/어색(-1/-2) 지명받은 고유 학생 수
  negativeOut: number;     // 갈등/어색 지명한 고유 학생 수
  avgClosenessReceived: number | null; // 친구들에게 받은 평균 친밀도 (-2.0 ~ +2.0)
  avgClosenessGiven: number | null;    // 친구들에게 준 평균 친밀도 (-2.0 ~ +2.0)
  closenessGap: number | null;         // 받은 평균 - 준 평균 (양수: 신중형, 음수: 적극접근형)
  receivedScoreCounts: ClosenessScoreCounts;
  givenScoreCounts: ClosenessScoreCounts;
  mutualIds: string[];         // 상호 긍정 선택 친구 ID 목록
  bestFriendPairIds: string[]; // 서로 +2(매우 친함)인 단짝 ID 목록
  mutualConflictIds: string[]; // 서로 -1/-2인 갈등·어색 ID 목록
  chosenByPositive: string[];
  chosePositive: string[];
  chosenByNegative: string[];
  choseNegative: string[];
  topPositiveTags: Array<{ tag: string; count: number }>;
  topNegativeTags: Array<{ tag: string; count: number }>;
  sociometricType: SociometricType;
  teacherNote: string;
}

export interface SociogramEdge {
  source: string;
  target: string;
  type: 'mutual' | 'positive' | 'negative';
  weight: number;
  maxScore: number; // 2 for +2, 1 for +1, -1 for -1, -2 for -2
  minScore: number; // lowest score on this edge (for distinguishing +2↔+2 vs +2↔+1 and -2 vs -1)
  tags: string[];
  questionIds: string[];
}

export interface AsymmetricPair {
  fromId: string;
  toId: string;
  scoreFromTo: ClosenessScore;
  scoreToFrom: ClosenessScore;
  gap: number;
  tagsFromTo: string[];
  tagsToFrom: string[];
}

export interface ClosenessPairSummary {
  aId: string;
  bId: string;
  scoreAB: ClosenessScore;
  scoreBA: ClosenessScore | null;
  tags: string[];
  category: 'best_mutual' | 'friendly_mutual' | 'mutual_conflict' | 'severe_oneway_conflict';
}

export interface TagClosenessStat {
  tag: string;
  category: 'positive' | 'negative';
  totalCount: number;
  strongCount: number; // +2 for positive, -2 for negative
  mildCount: number;   // +1 for positive, -1 for negative
}

export interface ClosenessAnalyticsSummary {
  totalRatingsCount: number;
  classAvgCloseness: number | null;
  distribution: ClosenessScoreCounts;
  bestMutualPairs: ClosenessPairSummary[];
  friendlyMutualPairs: ClosenessPairSummary[];
  conflictPairs: ClosenessPairSummary[];
  tagStats: TagClosenessStat[];
}

export interface ClassAnalytics {
  totalStudents: number;
  respondedCount: number;
  responseRate: number;
  mutualPairCount: number;
  reciprocityRate: number;
  avgPositiveIn: number;
  attentionStudents: StudentMetrics[];
  asymmetricPairs: AsymmetricPair[];
  closenessSummary: ClosenessAnalyticsSummary;
  metricsById: Record<string, StudentMetrics>;
  metricsList: StudentMetrics[];
  edges: SociogramEdge[];
  typeCounts: Record<SociometricType, number>;
}

export const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'q1',
    text: '가장 친하게 지내거나 고민을 편하게 나눌 수 있는 친구 (+2 매우 친함)',
    category: 'positive',
    maxSelect: 5,
  },
  {
    id: 'q2',
    text: '모둠 활동이나 쉬는 시간을 함께 보내기 좋은 친구 (+1 친한 편 이상)',
    category: 'positive',
    maxSelect: 5,
  },
  {
    id: 'q3',
    text: '어려움이 있을 때 도움을 주거나 믿고 의지할 수 있는 친구 (#도움·신뢰)',
    category: 'positive',
    maxSelect: 5,
  },
  {
    id: 'q4',
    text: '함께 지내기 어렵거나 어색·불편함을 느끼는 친구 (-1/-2)',
    category: 'negative',
    maxSelect: 5,
  },
];
