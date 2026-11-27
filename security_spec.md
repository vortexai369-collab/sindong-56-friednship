# Security Specification — 7942 친구사이 교우관계 조사 플랫폼

## 1. Data Invariants

1. **Teacher Ownership Invariant**: Every `Survey`, `Student`, and `SurveyResponse` document MUST belong to a verified Firebase Auth user (`ownerId == request.auth.uid`). No other teacher or student can read or list another teacher's surveys, student rosters, counseling memos, or peer responses.
2. **Master Gate Relational Invariant**: Every single-document operation on `surveys/{surveyId}/students/{studentId}` and `surveys/{surveyId}/responses/{studentDocId}` verifies parent survey existence and ownership via `get(/databases/$(database)/documents/surveys/$(surveyId))`.
3. **Zero Enumeration & PII Isolation**: `users/{userId}` forbids `list` and allows `get` strictly for `request.auth.uid == userId`. `surveyInvites` forbids non-owner `list` queries; students can only `get` an exact capability key (`{joinCode}_{accessCode}`).
4. **Atomic Submission & Terminal Locking**: A student submitting via `surveyInvites/{inviteKey}` MUST atomically create `surveys/{surveyId}/responses/{studentDocId}` AND flip `surveyInvites/{inviteKey}.submitted` from `false` to `true` in a single batch (`existsAfter` / `getAfter`). Once `submitted == true` or `surveyStatus == 'closed'`, non-owners can never resubmit or alter the invite.
5. **Temporal & Volumetric Integrity**: All `createdAt` / `updatedAt` timestamps MUST equal `request.time`. All IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), all strings enforce explicit `.size()` bounds, and all arrays enforce bounded `.size()` limits with element type checks.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)

1. **Unverified Email Spoof**: Write to `surveys/s1` with `email_verified: false`.
2. **Owner Hijack (Identity Spoofing)**: Create `surveys/s1` with `ownerId: "victim-uid"` while authenticated as `"attacker-uid"`.
3. **Shadow Field Injection**: Create `surveys/s1` with an extra ghost key `isAdmin: true`.
4. **ID Poisoning**: Create `surveys/<200-char-invalid-$id>` violating `isValidId()`.
5. **Blanket Roster Scraping**: List `surveys/s1/students` without matching `ownerId == request.auth.uid`.
6. **Cross-Teacher Response Leak**: `get` on `surveys/victimSurvey/responses/stu1` as another verified user.
7. **Invite Enumeration Attack**: `list` on `surveyInvites` as a student attempting to dump all access codes.
8. **Orphaned Student Creation**: Create `surveys/nonexistent/students/stu1` when parent survey does not exist.
9. **Non-Atomic Response Creation**: Student creates `surveys/s1/responses/stu1` without atomically setting `surveyInvites/{inviteKey}.submitted = true`.
10. **Terminal State Bypass (Resubmission)**: Student updates `surveyInvites/{inviteKey}` when `existing().submitted == true` or tries to flip `submitted` back to `false`.
11. **Value Poisoning on Update**: Update `surveys/s1` with `status: "hacked"` or a 2,000-char `title`.
12. **Client Timestamp Forgery**: Create `surveys/s1` with a client-forged `createdAt` timestamp not equal to `request.time`.
