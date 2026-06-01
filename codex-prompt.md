# CODEX 구현 컨텍스트: Evidence 피드백 학습 시스템 개선

## 프로젝트 개요

Electron + TypeScript 기반 프로젝트 관리 도구. RAG(Retrieval-Augmented Generation) 파이프라인을 통해 사용자 질문에 답변하고, evidence(검색된 청크)에 대한 사용자 피드백으로 검색 품질을 자동 개선한다.

DB는 `sql.js` (브라우저/Electron 호환 SQLite WebAssembly). IPC는 Electron `ipcMain.handle` / `ipcRenderer.invoke` 구조.

---

## 현재 파일 구조 (수정 대상)

```
src/
  shared/
    types.ts                          ← 타입 정의 (QuestionType 등)
  main/
    database/
      schema.ts                       ← 초기 DDL
      migrations.ts                   ← 버전별 마이그레이션
      repositories/
        adaptiveParamsRepository.ts   ← 적응형 파라미터 + 피드백 CRUD
    services/
      questionClassifier.ts           ← 질문 유형 분류
      contextChunker.ts               ← 청킹 + scoreChunk() + buildContext()
      adaptiveParams.ts               ← 파라미터 학습 로직
    handlers/
      queryHandlers.ts                ← IPC 핸들러 (evidence:feedback, evidence:submitAll)
```

---

## 현재 구현 요약

### 질문 분류 (`questionClassifier.ts`)
```
길이(short/long) × 복잡도(simple/complex) = 4가지 QuestionType
classifyQuestion(prompt: string): QuestionType
```

### 스코어링 (`contextChunker.ts` > `scoreChunk()`)
하드코딩된 7개 가중치:
```typescript
W_KEYWORD_BASE   = 1.0    // 키워드 매칭 기본 점수
W_FREQ_BONUS     = 0.3    // 키워드 등장 횟수 보너스 (회당, 최대 3회)
W_POSITION_BONUS = 0.5    // 키워드가 청크 앞 20% 이내 등장
W_TITLE_MATCH    = 0.8    // 소스 제목에 키워드 포함
W_FIRST_CHUNK    = 1.0    // 첫 번째 청크 보너스
W_MEETING_TYPE   = 1.2    // sourceType === 'meeting' 승수
W_TASK_TYPE      = 1.1    // sourceType === 'task' 승수
```

### 파라미터 학습 (`adaptiveParams.ts`)
- 유저별 × 질문유형별 `{chunkSize, overlap, topK, maxContextChars}` 저장
- `score = (interested - not_interested) / totalEvidenceCount`
- score에 비례해 topK, maxContextChars, overlap 조정
- 학습률 0.1 고정, 정수 반올림으로 작은 변화가 대부분 0이 됨

### DB 테이블 (현재)
- `user_chunking_params`: userId × questionType → 파라미터 4개
- `evidence_feedback`: 개별 피드백 로그

---

## 구현할 내용 (3가지를 모두 통합)

### 목표
"피드백이 실제로 검색 품질을 바꾼다" — topK 숫자만 조정하는 것이 아니라, 어떤 청크가 높은 점수를 받는지를 결정하는 스코어링 가중치 자체를 학습한다.

---

### 변경 1: `shared/types.ts`

**QuestionType 확장 — 소스 도메인 축 추가**

```typescript
// 기존
export type QuestionType = 'short_simple' | 'short_complex' | 'long_simple' | 'long_complex'

// 변경 후
export type QuestionDomain = 'git' | 'meeting' | 'document' | 'mixed'
export type QuestionType =
  | 'short_simple_git'     | 'short_simple_meeting'     | 'short_simple_document'     | 'short_simple_mixed'
  | 'short_complex_git'    | 'short_complex_meeting'    | 'short_complex_document'    | 'short_complex_mixed'
  | 'long_simple_git'      | 'long_simple_meeting'      | 'long_simple_document'      | 'long_simple_mixed'
  | 'long_complex_git'     | 'long_complex_meeting'     | 'long_complex_document'     | 'long_complex_mixed'
```

**스코어링 특징 벡터 타입 추가**

```typescript
// scoreChunk()가 반환할 특징 기여도
export interface ChunkFeatures {
  keywordBase: number      // 키워드 매칭 기여도
  freqBonus: number        // 빈도 보너스 기여도
  positionBonus: number    // 위치 보너스 기여도
  titleMatch: number       // 제목 매칭 기여도
  firstChunkBonus: number  // 첫 청크 보너스 기여도
  sourceTypeBonus: number  // 소스 타입 승수 기여도
}

// 특징 기여도를 포함한 청크 타입
export interface ScoredChunk extends Chunk {
  features: ChunkFeatures  // 이 청크가 높은 점수를 받은 이유
}
```

**스코어링 가중치 타입 추가**

```typescript
// 학습되는 가중치 프로필
export interface ScoringWeights {
  wKeywordBase: number    // default: 1.0
  wFreqBonus: number      // default: 0.3
  wPositionBonus: number  // default: 0.5
  wTitleMatch: number     // default: 0.8
  wFirstChunk: number     // default: 1.0
  wMeetingType: number    // default: 1.2
  wTaskType: number       // default: 1.1
}

// 베이지안 업데이트용 — 각 가중치의 현재값과 확신도
export interface BayesianWeights {
  wKeywordBase: number;    wKeywordBase_n: number
  wFreqBonus: number;      wFreqBonus_n: number
  wPositionBonus: number;  wPositionBonus_n: number
  wTitleMatch: number;     wTitleMatch_n: number
  wFirstChunk: number;     wFirstChunk_n: number
  wMeetingType: number;    wMeetingType_n: number
  wTaskType: number;       wTaskType_n: number
}
```

**EvidenceFeedbackRequest 확장**

```typescript
export interface EvidenceFeedbackRequest {
  userId: string
  queryLogId: number
  evidenceLogId: number
  feedback: EvidenceFeedbackType
  questionType: QuestionType       // 기존
  chunkFeatures: ChunkFeatures     // 추가: 이 evidence의 특징 기여도
}
```

---

### 변경 2: `questionClassifier.ts`

`classifyQuestion()`에 `sources: DataSource[]` 파라미터 추가.

```typescript
import type { QuestionType, QuestionDomain, DataSource } from '../../shared/types'

export function classifyQuestion(question: string, sources: DataSource[]): QuestionType {
  const length = classifyLength(question)
  const complexity = classifyComplexity(question)

  let domain: QuestionDomain
  if (sources.length === 1) {
    // DataSource → QuestionDomain 매핑
    // 'git' → 'git', 'meetings' → 'meeting', 'documents' → 'document'
    const map: Record<DataSource, QuestionDomain> = {
      git: 'git', meetings: 'meeting', documents: 'document', tasks: 'document'
    }
    domain = map[sources[0]]
  } else {
    domain = 'mixed'
  }

  return `${length}_${complexity}_${domain}` as QuestionType
}
```

호출부 `queryHandlers.ts`에서도 `classifyQuestion(request.prompt, request.sources)` 로 변경.

---

### 변경 3: `contextChunker.ts`

**`scoreChunk()`를 특징 기여도 반환하도록 수정**

```typescript
// 변경 전
export function scoreChunk(chunk: Chunk, keywords: string[]): number

// 변경 후
export function scoreChunk(
  chunk: Chunk,
  keywords: string[],
  weights?: ScoringWeights   // 없으면 기본값 사용
): { score: number; features: ChunkFeatures }
```

내부 구현: 각 가중치를 `weights?.wKeywordBase ?? 1.0` 형태로 참조하고, features 객체에 각 항목이 최종 점수에 기여한 값(가중치 × 원시값)을 기록.

**`buildContext()`에 가중치와 threshold 추가**

```typescript
export function buildContext(
  sources: ...,
  keywords: string[],
  options?: {
    chunkSize?: number
    overlap?: number
    topK?: number            // 최대 개수 캡 (안전 장치)
    maxContextChars?: number
    scoreThreshold?: number  // 추가: 이 점수 미만 청크 제외 (기본 0.5)
    scoringWeights?: ScoringWeights  // 추가: 학습된 가중치
  }
): ContextBuildResult

// ContextBuildResult에 selectedChunks를 ScoredChunk[]로 변경
export interface ContextBuildResult {
  contextBlock: string
  selectedChunks: ScoredChunk[]   // features 포함
  stats: { ... }
}
```

선택 로직:
```
점수순 정렬 → score >= scoreThreshold 인 것만 후보
→ 후보 중 topK개 + maxContextChars 제한으로 최종 선택
```

---

### 변경 4: `adaptiveParams.ts`

**기본 스코어링 가중치 정의**

```typescript
const DEFAULT_WEIGHTS: ScoringWeights = {
  wKeywordBase: 1.0, wFreqBonus: 0.3, wPositionBonus: 0.5,
  wTitleMatch: 0.8, wFirstChunk: 1.0, wMeetingType: 1.2, wTaskType: 1.1
}
```

**가중치 조회 함수 추가**

```typescript
export function getWeights(userId: string, questionType: QuestionType): ScoringWeights
// DB에 없으면 DEFAULT_WEIGHTS 반환
```

**베이지안 가중치 업데이트 함수 추가**

```typescript
export function updateWeightsFromFeedback(
  userId: string,
  questionType: QuestionType,
  feedbackItems: {
    feedback: EvidenceFeedbackType
    features: ChunkFeatures
  }[],
  totalEvidenceCount: number
): ScoringWeights
```

**베이지안 업데이트 로직:**

피드백 아이템을 순회하며, 각 특징이 해당 evidence의 점수에 기여한 비율에 따라 가중치를 조정한다.

```
interested 피드백 → 기여도가 높았던 특징의 가중치를 올린다
not_interested    → 기여도가 높았던 특징의 가중치를 내린다

베이지안 업데이트 공식 (각 가중치 w에 대해):
  signal = feature_contribution × (feedback === 'interested' ? +1 : -1)
  new_mean = (current_mean × n + signal) / (n + 1)
  new_n    = n + 1

  → n이 클수록 기존값이 지배적 (데이터 적을 때 보수적)
  → n이 작을 때는 새 신호가 크게 반영됨
```

범위 제한:
```typescript
const WEIGHT_BOUNDS = {
  wKeywordBase:   { min: 0.1, max: 3.0 },
  wFreqBonus:     { min: 0.0, max: 1.0 },
  wPositionBonus: { min: 0.0, max: 1.5 },
  wTitleMatch:    { min: 0.1, max: 2.0 },
  wFirstChunk:    { min: 0.0, max: 2.0 },
  wMeetingType:   { min: 0.8, max: 2.0 },
  wTaskType:      { min: 0.8, max: 1.8 },
}
```

**기존 `updateParamsFromBatch()`는 유지** (topK, maxContextChars, overlap 조정 — 안전 캡 역할).
단, 학습률 문제 수정: 정수 변화량이 0이 되지 않도록 `Math.max(1, Math.round(...))` 적용.

---

### 변경 5: `migrations.ts`

V005 마이그레이션 추가:

```sql
-- 유저별 × 질문유형별 스코어링 가중치 (베이지안 확신도 포함)
CREATE TABLE IF NOT EXISTS user_scoring_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  w_keyword_base REAL NOT NULL DEFAULT 1.0,   w_keyword_base_n INTEGER NOT NULL DEFAULT 0,
  w_freq_bonus REAL NOT NULL DEFAULT 0.3,     w_freq_bonus_n INTEGER NOT NULL DEFAULT 0,
  w_position_bonus REAL NOT NULL DEFAULT 0.5, w_position_bonus_n INTEGER NOT NULL DEFAULT 0,
  w_title_match REAL NOT NULL DEFAULT 0.8,    w_title_match_n INTEGER NOT NULL DEFAULT 0,
  w_first_chunk REAL NOT NULL DEFAULT 1.0,    w_first_chunk_n INTEGER NOT NULL DEFAULT 0,
  w_meeting_type REAL NOT NULL DEFAULT 1.2,   w_meeting_type_n INTEGER NOT NULL DEFAULT 0,
  w_task_type REAL NOT NULL DEFAULT 1.1,      w_task_type_n INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, question_type)
);

-- evidence_feedback 테이블에 특징 기여도 컬럼 추가
ALTER TABLE evidence_feedback ADD COLUMN chunk_features TEXT; -- JSON 직렬화
```

---

### 변경 6: `adaptiveParamsRepository.ts`

가중치 테이블 CRUD 추가:

```typescript
scoringWeightsRepository = {
  getByUserAndType(userId: string, questionType: string): BayesianWeights | null
  upsert(userId: string, questionType: string, weights: BayesianWeights): void
  getAllByUser(userId: string): BayesianWeights[]
}
```

`createFeedback()`에 `chunkFeatures?: ChunkFeatures` 파라미터 추가 → JSON으로 직렬화해서 저장.

---

### 변경 7: `queryHandlers.ts`

**`query:run` 핸들러**
- `classifyQuestion(request.prompt, request.sources)` 로 변경
- `getWeights(userId, questionType)` 로 가중치 조회
- `buildContext(sources, keywords, { ...adaptiveContextOptions, scoringWeights: weights })` 로 전달
- `saveQueryLogs()`에서 `contextResult.selectedChunks`의 `features`를 evidence_logs 메타데이터에 저장

**`evidence:feedback` 핸들러**
- `data.chunkFeatures`를 받아서 `createFeedback()`에 전달

**`evidence:submitAll` 핸들러**
- 기존 `updateParamsFromBatch()` 유지
- 추가: `updateWeightsFromFeedback()` 호출
- 반환값에 `updatedWeights` 포함

---

## 전체 데이터 흐름 (완성 후)

```
질문 입력 + 소스 선택
  ↓
[⑧] classifyQuestion(prompt, sources) → 'short_simple_git' 등 16가지 유형
  ↓
[⑦] getParams(userId, questionType)   → {topK, maxContextChars, overlap, threshold}
    getWeights(userId, questionType)  → {wKeywordBase: 1.3, wTitleMatch: 0.6, ...} (학습된 값)
  ↓
buildContext(sources, keywords, { ...params, scoringWeights: weights })
  → scoreChunk()가 학습된 가중치로 점수 계산
  → threshold 이상인 청크만 후보
  → topK cap 적용
  → selectedChunks에 features 포함
  ↓
LLM 호출 → evidence 표시
  ↓
사용자 피드백 (interested / not_interested)
  ↓
evidence:submitAll 호출
  → updateParamsFromBatch()  → topK, maxContextChars 미세 조정 (안전 캡)
  → updateWeightsFromFeedback() → 스코어링 가중치 베이지안 업데이트
  ↓
다음 질문: 가중치가 바뀌어 있어 scoreChunk() 결과가 달라짐
```

---

## 구현 시 주의사항

1. **`sql.js`는 WAL 모드 미지원** — `saveDB()` 호출로 명시적 플러시 필요. 기존 패턴 따를 것.
2. **QuestionType 변경으로 기존 DB 데이터 호환** — `user_chunking_params`의 기존 레코드(`short_simple` 등)는 마이그레이션 시 삭제하거나, `getParams()`에서 구형 타입 fallback 처리 필요.
3. **features는 score 계산 시 즉시 생성** — `scoreChunk()` 반환값에 포함하므로 별도 저장 타이밍 이슈 없음.
4. **`chunkFeatures`가 없는 구형 피드백** — `updateWeightsFromFeedback()`에서 features가 null이면 스킵.
5. **threshold 기본값** — 0.5로 시작. 소스가 git만 있는 경우 키워드 매칭이 없어 전체 score=0이 될 수 있으므로, `buildContext()` fallback 로직(현재 존재) 유지할 것.
