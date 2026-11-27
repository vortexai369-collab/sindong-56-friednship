import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Gender, Student, Survey, SurveyResponse } from '../types';
import {
  exportRosterToCsv,
  generateAccessCode,
  ParsedRosterRow,
  parseRosterText,
  triggerCsvDownload,
} from '../utils/sociometry';
import { buildStudentEntryUrl } from './StudentShareModal';

interface RosterManagerProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  onAddStudent: (data: {
    studentCode: string;
    number: number;
    name: string;
    gender: Gender;
    accessCode?: string;
  }) => Promise<void>;
  onUpdateStudent: (
    student: Student,
    updates: {
      studentCode: string;
      number: number;
      name: string;
      gender: Gender;
      accessCode: string;
    }
  ) => Promise<void>;
  onDeleteStudent: (student: Student) => Promise<void>;
  onResetResponse: (student: Student) => Promise<void>;
  onBulkImport: (rows: ParsedRosterRow[], replaceExisting: boolean) => Promise<void>;
  onOpenStudentSurvey: (accessCode: string) => void;
  onViewStudentResponse?: (studentId: string) => void;
}

export const RosterManager: React.FC<RosterManagerProps> = ({
  survey,
  students,
  responses,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onResetResponse,
  onBulkImport,
  onOpenStudentSurvey,
  onViewStudentResponse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '응답완료' | '미응답'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add / Edit Student modal
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formNumber, setFormNumber] = useState(1);
  const [formName, setFormName] = useState('');
  const [formGender, setFormGender] = useState<Gender>('남');
  const [formAccessCode, setFormAccessCode] = useState('');
  const [submittingStudent, setSubmittingStudent] = useState(false);

  // Sheet / CSV Bulk Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Print code slips overlay
  const [showPrintView, setShowPrintView] = useState(false);

  const respondedIds = useMemo(
    () => new Set(responses.map((r) => r.studentDocId)),
    [responses]
  );

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.number - b.number),
    [students]
  );

  const filteredStudents = useMemo(() => {
    return sortedStudents.filter((s) => {
      const liveDone = respondedIds.has(s.id) || s.status === '응답완료';
      if (statusFilter === '응답완료' && !liveDone) return false;
      if (statusFilter === '미응답' && liveDone) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          s.accessCode.toLowerCase().includes(q) ||
          String(s.number).includes(q)
        );
      }
      return true;
    });
  }, [sortedStudents, respondedIds, statusFilter, searchQuery]);

  const parsedPreview = useMemo(() => {
    if (!importText.trim()) return [];
    const used = replaceExisting
      ? new Set<string>()
      : new Set(students.map((s) => s.accessCode));
    return parseRosterText(importText, used);
  }, [importText, replaceExisting, students]);

  const openAddModal = () => {
    const nextNum =
      sortedStudents.length > 0
        ? Math.min(100, sortedStudents[sortedStudents.length - 1].number + 1)
        : 1;
    setEditingStudent(null);
    setFormCode(`S${String(nextNum).padStart(2, '0')}`);
    setFormNumber(nextNum);
    setFormName('');
    setFormGender('남');
    setFormAccessCode(generateAccessCode(5));
    setShowStudentModal(true);
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormCode(student.studentCode);
    setFormNumber(student.number);
    setFormName(student.name);
    setFormGender(student.gender);
    setFormAccessCode(student.accessCode);
    setShowStudentModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmittingStudent(true);
    try {
      if (editingStudent) {
        await onUpdateStudent(editingStudent, {
          studentCode: formCode.trim() || editingStudent.studentCode,
          number: formNumber,
          name: formName.trim(),
          gender: formGender,
          accessCode: formAccessCode.trim().toUpperCase(),
        });
      } else {
        await onAddStudent({
          studentCode: formCode.trim() || `S${String(formNumber).padStart(2, '0')}`,
          number: formNumber,
          name: formName.trim(),
          gender: formGender,
          accessCode: formAccessCode.trim().toUpperCase(),
        });
      }
      setShowStudentModal(false);
    } finally {
      setSubmittingStudent(false);
    }
  };

  const handleCopyStudentLink = async (student: Student) => {
    const url = buildStudentEntryUrl(survey.joinCode, student.accessCode);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(student.id);
      setTimeout(() => setCopiedId((prev) => (prev === student.id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked in some iframe contexts
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImportSubmit = async () => {
    if (parsedPreview.length === 0) return;
    setImporting(true);
    try {
      await onBulkImport(parsedPreview, replaceExisting);
      setImportText('');
      setShowImportModal(false);
    } finally {
      setImporting(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportRosterToCsv(students, respondedIds);
    triggerCsvDownload(csv, `${survey.className}_7942명단.csv`);
  };

  const handleRegenerateCode = async (student: Student) => {
    setBusyId(student.id);
    try {
      await onUpdateStudent(student, {
        studentCode: student.studentCode,
        number: student.number,
        name: student.name,
        gender: student.gender,
        accessCode: generateAccessCode(5),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 번호, 학생ID, 코드 검색"
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', '응답완료', '미응답'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all' ? `전체 (${students.length})` : tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            시트 / CSV 가져오기
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={students.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            CSV 내보내기
          </button>
          <button
            type="button"
            onClick={() => setShowPrintView(true)}
            disabled={students.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            코드표 인쇄
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            학생 추가
          </button>
        </div>
      </div>

      {/* Sheet Table matching 학생ID, 번호, 이름, 성별, 코드, 상태 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4 whitespace-nowrap">학생ID</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">번호</th>
                <th className="py-2.5 px-4 whitespace-nowrap">이름</th>
                <th className="py-2.5 px-3 whitespace-nowrap">성별</th>
                <th className="py-2.5 px-4 whitespace-nowrap">개인 코드</th>
                <th className="py-2.5 px-4 whitespace-nowrap">상태</th>
                <th className="py-2.5 px-4 whitespace-nowrap text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-500">
                    {students.length === 0
                      ? '등록된 학생이 없습니다. 상단의 "시트 / CSV 가져오기" 또는 "학생 추가"를 눌러 명단을 구성하세요.'
                      : '검색 조건에 해당하는 학생이 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const isDone = respondedIds.has(s.id) || s.status === '응답완료';
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 transition-colors h-11"
                    >
                      <td className="py-2 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {s.studentCode}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {s.number}
                      </td>
                      <td className="py-2 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-600">
                        <span className={s.gender === '남' ? 'text-blue-700' : 'text-pink-700'}>
                          {s.gender}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-800 tracking-wider">
                            {s.accessCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRegenerateCode(s)}
                            disabled={busyId === s.id}
                            title="접속 코드 재발급"
                            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap text-xs font-medium">
                        {isDone ? (
                          <span className="text-emerald-700">응답완료</span>
                        ) : (
                          <span className="text-slate-400">미응답</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {isDone && onViewStudentResponse && (
                            <button
                              type="button"
                              onClick={() => onViewStudentResponse(s.id)}
                              className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap cursor-pointer"
                            >
                              응답 보기
                            </button>
                          )}
                          {!isDone && survey.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => onOpenStudentSurvey(s.accessCode)}
                              className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap cursor-pointer"
                            >
                              설문 열기
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyStudentLink(s)}
                            title="개별 접속 링크 복사"
                            className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            {copiedId === s.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isDone && (
                            <button
                              type="button"
                              onClick={async () => {
                                setBusyId(s.id);
                                try {
                                  await onResetResponse(s);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              disabled={busyId === s.id}
                              title="응답 초기화 (재응답 허용)"
                              className="p-1 text-amber-600 hover:text-amber-800 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            title="정보 수정"
                            className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setBusyId(s.id);
                              try {
                                await onDeleteStudent(s);
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            disabled={busyId === s.id}
                            title="학생 삭제"
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 tabular-nums">
          <span>
            학급 코드 <strong className="font-mono text-slate-800">{survey.joinCode}</strong> ·
            시트 형식 호환 (학생ID, 번호, 이름, 성별, 코드, 상태)
          </span>
          <span>
            표시 {filteredStudents.length}명 / 전체 {students.length}명
          </span>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingStudent ? '학생 정보 수정' : '새 학생 등록'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">학생ID</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="S01"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">출석번호</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={formNumber}
                    onChange={(e) => setFormNumber(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">이름</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">성별</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as Gender)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  개별 접속 코드 (영문 대문자·숫자 4~16자)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={4}
                    maxLength={16}
                    value={formAccessCode}
                    onChange={(e) =>
                      setFormAccessCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    className="flex-1 px-3 py-2 text-sm font-mono tracking-wider border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setFormAccessCode(generateAccessCode(5))}
                    className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    자동 생성
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submittingStudent}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {submittingStudent ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Sheet / CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  구글 시트 / CSV 명단 일괄 가져오기
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  구글 시트에서 셀을 복사해 그대로 붙여넣거나 CSV 파일을 업로드하세요. (코드가
                  비어있으면 자동 발급됩니다)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                CSV 파일 선택
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                기존 명단 덮어쓰기 (기존 응답 초기화)
              </label>
            </div>

            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`학생ID,번호,이름,성별,코드,상태\nS01,1,김도윤,남,K7M2P,미응답\nS02,2,이서연,여,,미응답`}
              className="w-full p-3 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />

            {parsedPreview.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">학생ID</th>
                      <th className="py-2 px-2">번호</th>
                      <th className="py-2 px-3">이름</th>
                      <th className="py-2 px-2">성별</th>
                      <th className="py-2 px-3">발급 코드</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPreview.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-3 font-mono text-slate-600">{r.studentCode}</td>
                        <td className="py-1.5 px-2 tabular-nums">{r.number}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-900">{r.name}</td>
                        <td className="py-1.5 px-2">{r.gender}</td>
                        <td className="py-1.5 px-3 font-mono text-blue-700">{r.accessCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-slate-500 tabular-nums">
                인식된 학생: {parsedPreview.length}명 (학급당 최대 60명)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importing || parsedPreview.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {importing ? '등록 중...' : `${parsedPreview.length}명 일괄 등록`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Student Code Slips Overlay */}
      {showPrintView && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 no-print">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {survey.className} 학생 개별 접속 코드표
                </h2>
                <p className="text-xs text-slate-500">
                  인쇄 후 점선을 따라 잘라 학생들에게 나누어 주세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  인쇄하기
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintView(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">
                학생 전용 설문 입장 주소 (Google 로그인 불필요)
              </p>
              <p className="font-mono text-blue-700 break-all">
                {buildStudentEntryUrl(survey.joinCode)}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {sortedStudents.map((s) => (
                <div
                  key={s.id}
                  className="border border-dashed border-slate-400 rounded-lg p-4 space-y-2 break-inside-avoid"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{survey.className}</span>
                    <span className="font-mono">{s.studentCode}</span>
                  </div>
                  <p className="text-base font-bold text-slate-900">
                    {s.number}번 {s.name}
                  </p>
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">학급 코드</span>
                      <span className="font-mono font-bold text-slate-900">{survey.joinCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">개인 코드</span>
                      <span className="font-mono font-bold text-blue-700 text-sm">
                        {s.accessCode}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
