import { Timestamp } from 'firebase/firestore';

export type Gender = '남' | '여';
export type StudentStatus = '미응답' | '응답완료';
export type SurveyStatus = 'open' | 'closed';
export type QuestionCategory = 'positive' | 'negative';

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
  QUESTION_TEXT_MAX: 200,
  MAX_QUESTIONS: 8,
  MAX_CLASSMATES: 60,
  MAX_SELECT_LIMIT: 10,
} as const;

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

export interface SurveyResponse {
  id: string; // studentDocId
  ownerId: string;
  surveyId: string;
  studentDocId: string;
  studentCode: string;
  inviteKey: string;
  submittedByUid: string;
  answers: SurveyAnswer[];
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

export interface StudentMetrics {
  student: Student;
  responded: boolean;
  positiveIn: number;      // 긍정 지명받은 수 (고유 학생 수)
  positiveInTotal: number; // 긍정 지명 총 횟수 (문항 합산)
  positiveOut: number;     // 긍정 지명한 고유 학생 수
  negativeIn: number;      // 갈등/불편 지명받은 고유 학생 수
  negativeOut: number;     // 갈등/불편 지명한 고유 학생 수
  mutualIds: string[];     // 상호 긍정 선택 친구 ID 목록
  chosenByPositive: string[];
  chosePositive: string[];
  chosenByNegative: string[];
  choseNegative: string[];
  sociometricType: SociometricType;
  teacherNote: string;
}

export interface SociogramEdge {
  source: string;
  target: string;
  type: 'mutual' | 'positive' | 'negative';
  weight: number;
  questionIds: string[];
}

export interface ClassAnalytics {
  totalStudents: number;
  respondedCount: number;
  responseRate: number;
  mutualPairCount: number;
  reciprocityRate: number;
  avgPositiveIn: number;
  attentionStudents: StudentMetrics[];
  metricsById: Record<string, StudentMetrics>;
  metricsList: StudentMetrics[];
  edges: SociogramEdge[];
  typeCounts: Record<SociometricType, number>;
}

export const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'q1',
    text: '가장 친하게 지내거나 고민을 편하게 나눌 수 있는 친구를 선택하세요.',
    category: 'positive',
    maxSelect: 3,
  },
  {
    id: 'q2',
    text: '모둠 활동이나 체험학습을 함께하고 싶은 친구를 선택하세요.',
    category: 'positive',
    maxSelect: 3,
  },
  {
    id: 'q3',
    text: '어려움이 있을 때 도움을 주거나 믿고 의지할 수 있는 친구를 선택하세요.',
    category: 'positive',
    maxSelect: 3,
  },
  {
    id: 'q4',
    text: '함께 지내기 어렵거나 불편함을 느끼는 친구가 있다면 선택하세요. (선택 사항, 선생님만 확인합니다)',
    category: 'negative',
    maxSelect: 3,
  },
];
