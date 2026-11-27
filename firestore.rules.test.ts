/**
 * Phase 0 Security Specification Test Suite (Dirty Dozen Verification Matrix)
 * Verifies all 12 adversarial payloads against the Eight Pillars in firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string; emailVerified: boolean };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  enforcedByPillar: string;
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof',
    operation: 'create',
    path: '/surveys/survey_01',
    actor: { uid: 'teacher_a', emailVerified: false },
    payload: { ownerId: 'teacher_a', title: '1학기 조사', status: 'open' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Verified User Gate (email_verified == true)',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Survey Create',
    operation: 'create',
    path: '/surveys/survey_02',
    actor: { uid: 'attacker_uid', emailVerified: true },
    payload: { ownerId: 'victim_uid', title: 'Spoofed', status: 'open' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 (Identity Integrity)',
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    operation: 'create',
    path: '/surveys/survey_03',
    actor: { uid: 'teacher_a', emailVerified: true },
    payload: { ownerId: 'teacher_a', title: 'Valid', isAdmin: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 (Strict keys().hasOnly)',
  },
  {
    id: 4,
    name: 'Path Variable ID Poisoning',
    operation: 'create',
    path: '/surveys/' + 'x'.repeat(200) + '$invalid',
    actor: { uid: 'teacher_a', emailVerified: true },
    payload: { ownerId: 'teacher_a', title: 'Poison' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 3 (Path Variable Hardening)',
  },
  {
    id: 5,
    name: 'Unauthorized Student Roster List',
    operation: 'list',
    path: '/surveys/survey_01/students',
    actor: { uid: 'other_user', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 8 (Secure List Queries)',
  },
  {
    id: 6,
    name: 'Cross-Teacher Confidential Response Read',
    operation: 'get',
    path: '/surveys/survey_01/responses/stu_01',
    actor: { uid: 'student_user', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 1 & Pillar 6 (Master Gate & Confidentiality)',
  },
  {
    id: 7,
    name: 'Survey Invite Enumeration',
    operation: 'list',
    path: '/surveyInvites',
    actor: { uid: 'student_user', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 8 (Owner-Only List on surveyInvites)',
  },
  {
    id: 8,
    name: 'Orphaned Student Document Creation',
    operation: 'create',
    path: '/surveys/nonexistent_survey/students/stu_01',
    actor: { uid: 'teacher_a', emailVerified: true },
    payload: { ownerId: 'teacher_a', surveyId: 'nonexistent_survey', name: '김민준' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 1 (Master Gate Parent Exists Check)',
  },
  {
    id: 9,
    name: 'Non-Atomic Student Response Write',
    operation: 'create',
    path: '/surveys/survey_01/responses/stu_01',
    actor: { uid: 'student_user', emailVerified: true },
    payload: {
      ownerId: 'teacher_a',
      surveyId: 'survey_01',
      studentDocId: 'stu_01',
      inviteKey: 'CLASS53_AB12',
      submittedByUid: 'student_user',
      answers: [{ questionId: 'q1', category: 'positive', selectedIds: ['stu_02'] }],
      teacherNote: '',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 7 (Atomicity Guarantee via getAfter)',
  },
  {
    id: 10,
    name: 'Terminal State Bypass on Submitted Invite',
    operation: 'update',
    path: '/surveyInvites/CLASS53_AB12',
    actor: { uid: 'student_user', emailVerified: true },
    payload: { submitted: false },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4 & Terminal State Locking',
  },
  {
    id: 11,
    name: 'Value Poisoning on Whitelisted Update Key',
    operation: 'update',
    path: '/surveys/survey_01',
    actor: { uid: 'teacher_a', emailVerified: true },
    payload: { status: 'arbitrary_invalid_status' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 (Anti-Update-Gap isValidSurvey)',
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/surveys/survey_04',
    actor: { uid: 'teacher_a', emailVerified: true },
    payload: { ownerId: 'teacher_a', createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Temporal Integrity (createdAt == request.time)',
  },
];
