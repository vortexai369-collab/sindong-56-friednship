import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  ClassmateSummary,
  ClosenessScore,
  DEFAULT_QUESTIONS,
  Gender,
  PeerRating,
  SCHEMA_LIMITS,
  Student,
  Survey,
  SurveyAnswer,
  SurveyInvite,
  SurveyQuestion,
  SurveyResponse,
  SurveyStatus,
} from '../types';
import {
  buildInviteKey,
  buildSampleClassSeed,
  deriveAnswersFromPeerRatings,
  generateAccessCode,
  generateJoinCode,
  ParsedRosterRow,
  sanitizeCode,
} from '../utils/sociometry';

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '');
}

function clampString(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function sanitizeQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  const cleaned = questions
    .filter((q) => q.text.trim().length > 0)
    .slice(0, SCHEMA_LIMITS.MAX_QUESTIONS)
    .map((q, idx) => ({
      id: clampString(q.id || `q${idx + 1}`, 32).replace(/[^a-zA-Z0-9_\-]/g, '') || `q${idx + 1}`,
      text: clampString(q.text, SCHEMA_LIMITS.QUESTION_TEXT_MAX),
      category: q.category === 'negative' ? ('negative' as const) : ('positive' as const),
      maxSelect: Math.max(1, Math.min(SCHEMA_LIMITS.MAX_SELECT_LIMIT, Math.round(q.maxSelect || 3))),
    }));

  return cleaned.length > 0 ? cleaned : DEFAULT_QUESTIONS;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: clampString(user.displayName || '선생님', 80) || '선생님',
        photoURL: clampString(user.photoURL || '', 500),
        schoolName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createSurvey(
  ownerId: string,
  input: {
    title: string;
    className: string;
    academicYear: string;
    joinCode?: string;
    questions?: SurveyQuestion[];
    allowTeacherNote?: boolean;
  }
): Promise<Survey> {
  const surveyId = safeId('srv');
  const path = `surveys/${surveyId}`;
  const joinCode =
    sanitizeCode(input.joinCode || '').length >= 4
      ? sanitizeCode(input.joinCode || '').slice(0, SCHEMA_LIMITS.JOIN_CODE_MAX)
      : generateJoinCode();

  const questions = sanitizeQuestions(input.questions || DEFAULT_QUESTIONS);
  const payload = {
    ownerId,
    title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX) || '교우관계 조사',
    className: clampString(input.className, SCHEMA_LIMITS.CLASS_NAME_MAX) || '우리 반',
    academicYear: clampString(input.academicYear, SCHEMA_LIMITS.ACADEMIC_YEAR_MAX) || '2026',
    joinCode,
    status: 'open' as SurveyStatus,
    questions,
    allowTeacherNote: input.allowTeacherNote ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'surveys', surveyId), payload);
    return {
      id: surveyId,
      ownerId: payload.ownerId,
      title: payload.title,
      className: payload.className,
      academicYear: payload.academicYear,
      joinCode: payload.joinCode,
      status: payload.status,
      questions: payload.questions,
      allowTeacherNote: payload.allowTeacherNote,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Synchronizes capability-keyed student invites (`surveyInvites/{joinCode}_{accessCode}`)
 * while preserving immutable `createdAt` on existing invites and removing stale invites.
 */
export async function syncSurveyInvites(
  survey: Survey,
  students: Student[],
  respondedStudentIds: Set<string>,
  staleInviteKeys: string[] = []
): Promise<void> {
  const path = 'surveyInvites';
  try {
    const classmates: ClassmateSummary[] = [...students]
      .sort((a, b) => a.number - b.number)
      .slice(0, SCHEMA_LIMITS.MAX_CLASSMATES)
      .map((s) => ({
        id: s.id,
        number: s.number,
        name: clampString(s.name, SCHEMA_LIMITS.NAME_MAX),
        gender: s.gender,
      }));

    // Fetch existing invites owned by this teacher and filter for this survey to avoid composite index requirements
    const existingSnap = await getDocs(
      query(
        collection(db, 'surveyInvites'),
        where('ownerId', '==', survey.ownerId)
      )
    );
    const existingKeys = new Set<string>();
    existingSnap.forEach((d) => {
      if (d.data().surveyId === survey.id) {
        existingKeys.add(d.id);
      }
    });

    const desiredKeys = new Set<string>();
    const batch = writeBatch(db);

    for (const s of students.slice(0, SCHEMA_LIMITS.MAX_CLASSMATES)) {
      const inviteKey = buildInviteKey(survey.joinCode, s.accessCode);
      desiredKeys.add(inviteKey);
      const inviteRef = doc(db, 'surveyInvites', inviteKey);
      const isSubmitted = respondedStudentIds.has(s.id) || s.status === '응답완료';

      if (existingKeys.has(inviteKey)) {
        batch.update(inviteRef, {
          studentCode: clampString(s.studentCode, SCHEMA_LIMITS.STUDENT_CODE_MAX),
          studentNumber: s.number,
          studentName: clampString(s.name, SCHEMA_LIMITS.NAME_MAX),
          surveyTitle: clampString(survey.title, SCHEMA_LIMITS.TITLE_MAX),
          className: clampString(survey.className, SCHEMA_LIMITS.CLASS_NAME_MAX),
          surveyStatus: survey.status,
          allowTeacherNote: survey.allowTeacherNote,
          questions: sanitizeQuestions(survey.questions),
          classmates,
          submitted: isSubmitted,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(inviteRef, {
          ownerId: survey.ownerId,
          surveyId: survey.id,
          studentDocId: s.id,
          studentCode: clampString(s.studentCode, SCHEMA_LIMITS.STUDENT_CODE_MAX),
          studentNumber: s.number,
          studentName: clampString(s.name, SCHEMA_LIMITS.NAME_MAX),
          surveyTitle: clampString(survey.title, SCHEMA_LIMITS.TITLE_MAX),
          className: clampString(survey.className, SCHEMA_LIMITS.CLASS_NAME_MAX),
          surveyStatus: survey.status,
          allowTeacherNote: survey.allowTeacherNote,
          questions: sanitizeQuestions(survey.questions),
          classmates,
          submitted: isSubmitted,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Delete any orphaned or explicitly stale invites for this survey
    const toDelete = new Set<string>(staleInviteKeys);
    existingKeys.forEach((key) => {
      if (!desiredKeys.has(key)) toDelete.add(key);
    });
    toDelete.forEach((key) => {
      if (!desiredKeys.has(key)) {
        batch.delete(doc(db, 'surveyInvites', key));
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateSurveyDetails(
  survey: Survey,
  updates: {
    title: string;
    className: string;
    academicYear: string;
    joinCode: string;
    questions: SurveyQuestion[];
    allowTeacherNote: boolean;
  },
  students: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const path = `surveys/${survey.id}`;
  const cleanJoinCode =
    sanitizeCode(updates.joinCode).length >= 4
      ? sanitizeCode(updates.joinCode).slice(0, SCHEMA_LIMITS.JOIN_CODE_MAX)
      : survey.joinCode;

  const updatedSurvey: Survey = {
    ...survey,
    title: clampString(updates.title, SCHEMA_LIMITS.TITLE_MAX) || survey.title,
    className: clampString(updates.className, SCHEMA_LIMITS.CLASS_NAME_MAX) || survey.className,
    academicYear: clampString(updates.academicYear, SCHEMA_LIMITS.ACADEMIC_YEAR_MAX) || survey.academicYear,
    joinCode: cleanJoinCode,
    questions: sanitizeQuestions(updates.questions),
    allowTeacherNote: updates.allowTeacherNote,
  };

  try {
    await updateDoc(doc(db, 'surveys', survey.id), {
      title: updatedSurvey.title,
      className: updatedSurvey.className,
      academicYear: updatedSurvey.academicYear,
      joinCode: updatedSurvey.joinCode,
      questions: updatedSurvey.questions,
      allowTeacherNote: updatedSurvey.allowTeacherNote,
      updatedAt: serverTimestamp(),
    });
    await syncSurveyInvites(updatedSurvey, students, respondedIds);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleSurveyStatus(
  survey: Survey,
  nextStatus: SurveyStatus,
  students: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const path = `surveys/${survey.id}`;
  try {
    await updateDoc(doc(db, 'surveys', survey.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    await syncSurveyInvites({ ...survey, status: nextStatus }, students, respondedIds);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSurveyCascade(
  survey: Survey,
  students: Student[],
  responses: SurveyResponse[]
): Promise<void> {
  const path = `surveys/${survey.id}`;
  try {
    const batch = writeBatch(db);
    // Delete invites belonging to this survey
    const invSnap = await getDocs(
      query(
        collection(db, 'surveyInvites'),
        where('ownerId', '==', survey.ownerId)
      )
    );
    invSnap.forEach((d) => {
      if (d.data().surveyId === survey.id) {
        batch.delete(d.ref);
      }
    });

    // Delete responses
    responses.forEach((r) => {
      batch.delete(doc(db, 'surveys', survey.id, 'responses', r.id));
    });

    // Delete students
    students.forEach((s) => {
      batch.delete(doc(db, 'surveys', survey.id, 'students', s.id));
    });

    // Delete parent survey last (note: Master Gate on subcollection delete checks parent existence,
    // so commit subcollections BEFORE deleting the parent survey!)
    await batch.commit();
    await deleteDoc(doc(db, 'surveys', survey.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addStudent(
  survey: Survey,
  data: {
    studentCode: string;
    number: number;
    name: string;
    gender: Gender;
    accessCode?: string;
  },
  existingStudents: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const studentId = safeId('stu');
  const path = `surveys/${survey.id}/students/${studentId}`;
  const usedCodes = new Set(existingStudents.map((s) => s.accessCode));

  let accessCode = sanitizeCode(data.accessCode || '').slice(0, SCHEMA_LIMITS.ACCESS_CODE_MAX);
  if (accessCode.length < 4 || usedCodes.has(accessCode)) {
    do {
      accessCode = generateAccessCode(5);
    } while (usedCodes.has(accessCode));
  }

  const num = Math.max(1, Math.min(100, Math.round(data.number || existingStudents.length + 1)));
  const newStudent: Student = {
    id: studentId,
    ownerId: survey.ownerId,
    surveyId: survey.id,
    studentCode: clampString(data.studentCode || `S${String(num).padStart(2, '0')}`, SCHEMA_LIMITS.STUDENT_CODE_MAX),
    number: num,
    name: clampString(data.name, SCHEMA_LIMITS.NAME_MAX),
    gender: data.gender,
    accessCode,
    status: '미응답',
    memo: '',
  };

  try {
    await setDoc(doc(db, 'surveys', survey.id, 'students', studentId), {
      ownerId: newStudent.ownerId,
      surveyId: newStudent.surveyId,
      studentCode: newStudent.studentCode,
      number: newStudent.number,
      name: newStudent.name,
      gender: newStudent.gender,
      accessCode: newStudent.accessCode,
      status: newStudent.status,
      memo: newStudent.memo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await syncSurveyInvites(survey, [...existingStudents, newStudent], respondedIds);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStudentInfo(
  survey: Survey,
  student: Student,
  updates: {
    studentCode: string;
    number: number;
    name: string;
    gender: Gender;
    accessCode: string;
  },
  allStudents: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const path = `surveys/${survey.id}/students/${student.id}`;
  const cleanCode = sanitizeCode(updates.accessCode).slice(0, SCHEMA_LIMITS.ACCESS_CODE_MAX);
  const accessCode = cleanCode.length >= 4 ? cleanCode : student.accessCode;
  const num = Math.max(1, Math.min(100, Math.round(updates.number || student.number)));

  const updated: Student = {
    ...student,
    studentCode: clampString(updates.studentCode || student.studentCode, SCHEMA_LIMITS.STUDENT_CODE_MAX),
    number: num,
    name: clampString(updates.name || student.name, SCHEMA_LIMITS.NAME_MAX),
    gender: updates.gender,
    accessCode,
  };

  try {
    await updateDoc(doc(db, 'surveys', survey.id, 'students', student.id), {
      studentCode: updated.studentCode,
      number: updated.number,
      name: updated.name,
      gender: updated.gender,
      accessCode: updated.accessCode,
      updatedAt: serverTimestamp(),
    });
    const nextList = allStudents.map((s) => (s.id === student.id ? updated : s));
    await syncSurveyInvites(survey, nextList, respondedIds);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateStudentMemo(
  surveyId: string,
  studentId: string,
  memo: string
): Promise<void> {
  const path = `surveys/${surveyId}/students/${studentId}`;
  try {
    await updateDoc(doc(db, 'surveys', surveyId, 'students', studentId), {
      memo: clampString(memo, SCHEMA_LIMITS.MEMO_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStudent(
  survey: Survey,
  student: Student,
  allStudents: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const path = `surveys/${survey.id}/students/${student.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'surveys', survey.id, 'students', student.id));
    if (respondedIds.has(student.id)) {
      batch.delete(doc(db, 'surveys', survey.id, 'responses', student.id));
    }
    await batch.commit();

    const remaining = allStudents.filter((s) => s.id !== student.id);
    const nextResponded = new Set(respondedIds);
    nextResponded.delete(student.id);
    await syncSurveyInvites(survey, remaining, nextResponded, [
      buildInviteKey(survey.joinCode, student.accessCode),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function bulkImportStudents(
  survey: Survey,
  rows: ParsedRosterRow[],
  existingStudents: Student[],
  respondedIds: Set<string>,
  replaceExisting: boolean
): Promise<void> {
  const path = `surveys/${survey.id}/students`;
  try {
    const batch = writeBatch(db);
    const baseList: Student[] = replaceExisting ? [] : [...existingStudents];

    if (replaceExisting) {
      existingStudents.forEach((s) => {
        batch.delete(doc(db, 'surveys', survey.id, 'students', s.id));
        if (respondedIds.has(s.id)) {
          batch.delete(doc(db, 'surveys', survey.id, 'responses', s.id));
        }
      });
    }

    const usedCodes = new Set(baseList.map((s) => s.accessCode));
    const availableSlots = Math.max(0, SCHEMA_LIMITS.MAX_CLASSMATES - baseList.length);
    const rowsToAdd = rows.slice(0, availableSlots);

    for (const row of rowsToAdd) {
      const studentId = safeId('stu');
      let code = sanitizeCode(row.accessCode).slice(0, SCHEMA_LIMITS.ACCESS_CODE_MAX);
      if (code.length < 4 || usedCodes.has(code)) {
        do {
          code = generateAccessCode(5);
        } while (usedCodes.has(code));
      }
      usedCodes.add(code);

      const studentObj: Student = {
        id: studentId,
        ownerId: survey.ownerId,
        surveyId: survey.id,
        studentCode: clampString(row.studentCode, SCHEMA_LIMITS.STUDENT_CODE_MAX),
        number: Math.max(1, Math.min(100, row.number)),
        name: clampString(row.name, SCHEMA_LIMITS.NAME_MAX),
        gender: row.gender,
        accessCode: code,
        status: '미응답',
        memo: '',
      };

      batch.set(doc(db, 'surveys', survey.id, 'students', studentId), {
        ownerId: studentObj.ownerId,
        surveyId: studentObj.surveyId,
        studentCode: studentObj.studentCode,
        number: studentObj.number,
        name: studentObj.name,
        gender: studentObj.gender,
        accessCode: studentObj.accessCode,
        status: studentObj.status,
        memo: studentObj.memo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      baseList.push(studentObj);
    }

    await batch.commit();
    const nextResponded = replaceExisting ? new Set<string>() : respondedIds;
    await syncSurveyInvites(survey, baseList, nextResponded);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resetStudentResponse(
  survey: Survey,
  student: Student,
  allStudents: Student[],
  respondedIds: Set<string>
): Promise<void> {
  const path = `surveys/${survey.id}/responses/${student.id}`;
  try {
    const batch = writeBatch(db);
    if (respondedIds.has(student.id)) {
      batch.delete(doc(db, 'surveys', survey.id, 'responses', student.id));
    }
    batch.update(doc(db, 'surveys', survey.id, 'students', student.id), {
      status: '미응답',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    const nextResponded = new Set(respondedIds);
    nextResponded.delete(student.id);
    const nextStudents = allStudents.map((s) =>
      s.id === student.id ? { ...s, status: '미응답' as const } : s
    );
    await syncSurveyInvites(survey, nextStudents, nextResponded);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchInviteByCodes(
  joinCode: string,
  accessCode: string
): Promise<SurveyInvite | null> {
  const inviteKey = buildInviteKey(joinCode, accessCode);
  if (inviteKey.length < 5) return null;
  const path = `surveyInvites/${inviteKey}`;
  try {
    const snap = await getDoc(doc(db, 'surveyInvites', inviteKey));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ownerId: data.ownerId,
      surveyId: data.surveyId,
      studentDocId: data.studentDocId,
      studentCode: data.studentCode,
      studentNumber: data.studentNumber,
      studentName: data.studentName,
      surveyTitle: data.surveyTitle,
      className: data.className,
      surveyStatus: data.surveyStatus,
      allowTeacherNote: data.allowTeacherNote,
      questions: data.questions || [],
      classmates: data.classmates || [],
      submitted: Boolean(data.submitted),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Atomically submits a student's survey response and locks their invite (`submitted: true`).
 * Enforces Pillar 7 atomicity (`existsAfter` & `getAfter`) in Firestore Security Rules.
 */
export async function submitStudentResponse(
  invite: SurveyInvite,
  peerRatings: PeerRating[],
  teacherNote: string,
  explicitAnswers?: SurveyAnswer[]
): Promise<void> {
  const verifiedUid = auth.currentUser?.emailVerified ? auth.currentUser.uid : null;
  const submittedByUid = verifiedUid || `student_${invite.id}`;

  const path = `surveys/${invite.surveyId}/responses/${invite.studentDocId}`;
  const isTeacherOwner = Boolean(verifiedUid && verifiedUid === invite.ownerId);

  const validClassmateIdSet = new Set(
    invite.classmates.map((c) => c.id).filter((id) => id && id !== invite.studentDocId)
  );

  const cleanPeerRatings: PeerRating[] = peerRatings
    .filter((r) => r.targetId && r.targetId !== invite.studentDocId)
    .slice(0, SCHEMA_LIMITS.MAX_CLASSMATES)
    .map((r) => {
      const clampedScore = Math.max(-2, Math.min(2, Math.round(r.score))) as ClosenessScore;
      return {
        targetId: clampString(r.targetId, 128),
        score: clampedScore,
        tags: Array.from(new Set((r.tags || []).map((t) => clampString(t, 32)).filter(Boolean))).slice(
          0,
          SCHEMA_LIMITS.MAX_PEER_TAGS
        ),
        note: clampString(r.note || '', SCHEMA_LIMITS.PEER_NOTE_MAX),
      };
    });

  let finalAnswers: SurveyAnswer[];
  if (explicitAnswers && explicitAnswers.length > 0 && invite.questions.length > 0) {
    const answerByQId = new Map<string, SurveyAnswer>();
    explicitAnswers.forEach((a) => answerByQId.set(a.questionId, a));

    finalAnswers = invite.questions.slice(0, SCHEMA_LIMITS.MAX_QUESTIONS).map((q) => {
      const found = answerByQId.get(q.id);
      const maxAllowed = Math.max(1, Math.min(SCHEMA_LIMITS.MAX_CLASSMATES, q.maxSelect || 10));
      const cleanIds = Array.from(
        new Set(
          (found?.selectedIds || [])
            .map((id) => clampString(id, 128))
            .filter((id) => id && id !== invite.studentDocId && validClassmateIdSet.has(id))
        )
      ).slice(0, maxAllowed);
      return {
        questionId: clampString(q.id, 32),
        category: q.category === 'negative' ? ('negative' as const) : ('positive' as const),
        selectedIds: cleanIds,
      };
    });
  } else {
    finalAnswers = deriveAnswersFromPeerRatings(
      cleanPeerRatings,
      invite.questions.map((q) => ({ id: q.id, category: q.category }))
    );
  }

  try {
    const batch = writeBatch(db);
    const responseRef = doc(db, 'surveys', invite.surveyId, 'responses', invite.studentDocId);
    const inviteRef = doc(db, 'surveyInvites', invite.id);

    batch.set(responseRef, {
      ownerId: invite.ownerId,
      surveyId: invite.surveyId,
      studentDocId: invite.studentDocId,
      studentCode: clampString(invite.studentCode, SCHEMA_LIMITS.STUDENT_CODE_MAX),
      inviteKey: invite.id,
      submittedByUid,
      answers: finalAnswers,
      peerRatings: cleanPeerRatings,
      teacherNote: clampString(teacherNote, SCHEMA_LIMITS.NOTE_MAX),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(inviteRef, {
      submitted: true,
      updatedAt: serverTimestamp(),
    });

    if (isTeacherOwner) {
      batch.update(doc(db, 'surveys', invite.surveyId, 'students', invite.studentDocId), {
        status: '응답완료',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Seeds a complete 16-student sample classroom with 14 realistic responses (2 remaining 미응답)
 * so teachers can immediately explore the sociogram, matrix, and kiosk mode.
 */
export async function createSampleClassSurvey(ownerId: string): Promise<Survey> {
  const survey = await createSurvey(ownerId, {
    title: '1학기 교우관계 조사 (샘플)',
    className: '5학년 3반',
    academicYear: '2026',
    joinCode: generateJoinCode(),
    questions: DEFAULT_QUESTIONS,
    allowTeacherNote: true,
  });

  const seed = buildSampleClassSeed();
  const respondedSet = new Set(seed.responses.map((r) => r.studentDocId));
  const classmates: ClassmateSummary[] = seed.students.map((s) => ({
    id: s.docId,
    number: s.number,
    name: s.name,
    gender: s.gender,
  }));

  const path = `surveys/${survey.id}/students`;
  try {
    const batch = writeBatch(db);

    for (const s of seed.students) {
      const isDone = respondedSet.has(s.docId);
      const inviteKey = buildInviteKey(survey.joinCode, s.accessCode);

      batch.set(doc(db, 'surveys', survey.id, 'students', s.docId), {
        ownerId,
        surveyId: survey.id,
        studentCode: s.studentCode,
        number: s.number,
        name: s.name,
        gender: s.gender,
        accessCode: s.accessCode,
        status: isDone ? '응답완료' : '미응답',
        memo: s.memo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'surveyInvites', inviteKey), {
        ownerId,
        surveyId: survey.id,
        studentDocId: s.docId,
        studentCode: s.studentCode,
        studentNumber: s.number,
        studentName: s.name,
        surveyTitle: survey.title,
        className: survey.className,
        surveyStatus: survey.status,
        allowTeacherNote: survey.allowTeacherNote,
        questions: survey.questions,
        classmates,
        submitted: isDone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const r of seed.responses) {
      const stu = seed.students.find((s) => s.docId === r.studentDocId);
      if (!stu) continue;
      const inviteKey = buildInviteKey(survey.joinCode, stu.accessCode);

      batch.set(doc(db, 'surveys', survey.id, 'responses', r.studentDocId), {
        ownerId,
        surveyId: survey.id,
        studentDocId: r.studentDocId,
        studentCode: stu.studentCode,
        inviteKey,
        submittedByUid: ownerId,
        answers: r.answers,
        peerRatings: r.peerRatings,
        teacherNote: r.teacherNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return survey;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
