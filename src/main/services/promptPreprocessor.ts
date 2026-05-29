/**
 * 프롬프트 전처리 모듈
 *
 * 사용자 입력에서 한국어 불용어(조사·접속사·어미)를 제거하고
 * 핵심 키워드만 추출하여 검색 및 LLM 전송용 텍스트를 최적화합니다.
 */

// ── 한국어 불용어 사전 ───────────────────────────────────────────

const STOPWORDS = new Set([
  // 조사
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로',
  '와', '과', '도', '만', '까지', '부터', '에게', '한테', '께',
  '이나', '나', '든지', '라도', '처럼', '같이', '보다', '마다',
  // 접속사·부사
  '그리고', '그러나', '그래서', '하지만', '또한', '또는', '즉',
  '그런데', '따라서', '그러므로', '왜냐하면', '만약', '비록',
  '그래도', '그렇지만', '그러면', '그럼', '그리하여',
  // 지시어·대명사
  '이것', '그것', '저것', '여기', '거기', '저기',
  '이런', '그런', '저런', '이렇게', '그렇게', '저렇게',
  // 보조 용언·어미
  '있다', '없다', '하다', '되다', '이다', '있는', '없는', '하는', '되는',
  '했다', '됐다', '한다', '된다', '했던', '있었', '없었',
  '것', '수', '등', '때문', '위해', '통해', '대해', '관해',
  // 정도 부사
  '좀', '잘', '매우', '정말', '아주', '너무', '꽤', '약간',
  '상당히', '굉장히', '엄청', '몹시', '다소',
  // 의문사 (검색 질의에서 자주 등장하나 검색에 불필요)
  '어떻게', '무엇', '어디', '언제', '왜', '어떤', '몇',
  // 요청 표현
  '알려줘', '알려주세요', '해줘', '해주세요', '보여줘', '보여주세요',
  '뭐야', '뭔가요', '인가요', '인가', '일까', '일까요',
  '말해줘', '말해주세요', '찾아줘', '찾아주세요',
  '설명해줘', '설명해주세요', '분석해', '분석해줘', '분석해주세요',
  '있는지', '참고해서', '바탕으로', '기반으로', '대해서',
  '도입한다면', '있을까', '언급된', '작성해야', '하는지', '요약해봐', '요약해',
  '분석하고', '지연된다면', '미칠지', '순차적', '추론해줘', '참고하여', '발생할',
  '예측해보고', '통신할', '막으려면', '짜야하는지', '분석해봐', '발생한다고',
  '가정했', '계획된', '분석해서', '일어날지', '예측해봐', '비교해서', '선정한',
  '증명할지', '비교하고', '커질', '경우', '설계해야', '어떤', '대해', '어디',
  '나열해줘', '찾아서', '비교해봐', '알려줘.', '비교해봐.',
  '설정', '파일', '로컬', '구동', '시스템', '외부', '코드', '원인', '기능',
  '초안', '결과', '장단점', '단계별', '예상되는', '실제', '명시되어', '다이어그램',
  '입력하고', '수정하', '방식', '차이점', 'API와'
])

// ── 동의어 사전 (Synonyms) ──────────────────────────────────────────
const SYNONYMS: Record<string, string[]> = {
  '리트리벌': ['retrieval'],
  '하이브리드': ['hybrid'],
  '보안': ['security', 'api key', 'env', 'token', 'secret', 'exposure'],
  '유출': ['leak', 'expose', 'credential'],
  '의존성': ['package', 'dependency'],
  '패키지': ['package', 'dependency', 'package.json'],
  '빌드': ['vite', 'electron-builder', 'package.json', 'tsconfig'],
  '디비': ['db', 'database'],
  '데이터베이스': ['db', 'database'],
  '데몬': ['daemon'],
  '캐시': ['cache'],
  '리랭킹': ['reranking', 'rerank'],
  '외부': ['apiKey', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY'],
  '앱': ['electron', 'preload', 'ipc', 'nodeIntegration', 'contextIsolation']
}

// ── 조사 분리용 정규식 패턴 ──────────────────────────────────────
// 한글 단어 뒤에 붙은 조사를 분리합니다.
// 긴 조사부터 매칭해야 "에서"가 "에" + "서"로 쪼개지지 않습니다.
const JOSA_PATTERN =
  /([\uAC00-\uD7AF]+?)(에서|으로|부터|까지|에게|한테|처럼|같이|보다|마다|이나|라도|든지|은|는|이|가|을|를|의|에|로|와|과|도|만|나)(?=\s|$|[,.])/g

/**
 * 텍스트를 정규화합니다.
 * - 연속 공백 → 단일 공백
 * - 앞뒤 공백 제거
 * - 특수문자 중 의미 없는 것 제거
 */
export function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[~!@#$%^&*()\-_=+\[\]{}|\\;:'",.<>/?`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 한국어 조사를 분리하여 어근만 남깁니다.
 *
 * 예: "프로젝트에서" → "프로젝트"
 *     "회의록의"     → "회의록"
 *     "태스크를"     → "태스크"
 */
export function stripJosa(text: string): string {
  return text.replace(JOSA_PATTERN, '$1')
}

/**
 * 불용어를 제거하고 의미 있는 토큰만 반환합니다.
 */
export function removeStopwords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1)
}

/**
 * 사용자 입력에서 검색용 키워드를 추출합니다.
 *
 * 파이프라인: 정규화 → 조사 분리 → 토큰화 → 불용어 제거 → 중복 제거
 *
 * @example
 * extractKeywords("현재 프로젝트에서 진행 중인 태스크는 어떤 것들이 있나요?")
 * // → ["현재", "프로젝트", "진행", "중인", "태스크"]
 */
export function extractKeywords(userInput: string): string[] {
  // 1) 정규화
  let text = normalize(userInput)

  // 2) 조사 분리
  text = stripJosa(text)

  // 3) 공백 기준 토큰 분리
  const tokens = text.split(/\s+/).filter((t) => t.length > 0)

  // 4) 불용어 제거
  const meaningful = removeStopwords(tokens)

  // 동의어 확장 (1단계 성능 튜닝)
  const expanded: string[] = []
  for (const t of meaningful) {
    expanded.push(t)
    if (SYNONYMS[t]) {
      expanded.push(...SYNONYMS[t])
    }
  }

  // 5) 중복 제거 (순서 유지)
  return [...new Set(expanded)]
}

/**
 * LLM 전송용으로 정제된 질문을 생성합니다.
 * 불용어 제거까지는 하지 않고 정규화 + 조사 분리만 수행하여
 * 자연스러운 문장을 유지합니다.
 */
export function cleanQuery(userInput: string): string {
  return normalize(userInput)
}

/**
 * 전처리 결과를 한번에 반환합니다.
 */
export function preprocessPrompt(userInput: string): {
  keywords: string[]
  cleanedQuery: string
  originalInput: string
} {
  return {
    keywords: extractKeywords(userInput),
    cleanedQuery: cleanQuery(userInput),
    originalInput: userInput.trim(),
  }
}
