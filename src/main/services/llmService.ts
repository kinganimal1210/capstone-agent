/**
 * LLM 서비스 모듈
 *
 * OpenAI, Anthropic (Claude), Google Gemini API를 통합하여
 * 기존 promptBuilder의 출력을 실제 LLM에 전송합니다.
 *
 * 설치 필요 패키지:
 *   npm install openai @anthropic-ai/sdk @google/generative-ai dotenv
 */

// Types

export type LLMProvider = 'openai' | 'claude' | 'gemini'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  /** 사용할 모델 (기본값은 provider별 자동 선택) */
  model?: string
  /** 최대 출력 토큰 수 */
  maxTokens?: number
  /** 응답 온도 (창의성) */
  temperature?: number
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  /** LLM 응답 텍스트 */
  content: string
  /** 사용한 provider */
  provider: LLMProvider
  /** 사용한 모델 */
  model: string
  /** 토큰 사용량 (API에서 제공하는 경우) */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** 응답 소요 시간 (ms) */
  latencyMs: number
}

// Default Models

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
}

const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TEMPERATURE = 0.3

// OpenAI API

async function callOpenAI(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const { default: OpenAI } = await import('openai')

  const client = new OpenAI({ apiKey: config.apiKey })
  const model = config.model ?? DEFAULT_MODELS.openai

  const startTime = Date.now()

  const response = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    })),
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
  })

  const latencyMs = Date.now() - startTime

  return {
    content: response.choices[0]?.message?.content ?? '',
    provider: 'openai',
    model,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
    latencyMs,
  }
}

// Anthropic Claude API

async function callClaude(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')

  const client = new Anthropic({ apiKey: config.apiKey })
  const model = config.model ?? DEFAULT_MODELS.claude

  // Claude는 system 메시지를 별도 파라미터로 전달
  const systemMessage = messages.find((m) => m.role === 'system')?.content ?? ''
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  const startTime = Date.now()

  const response = await client.messages.create({
    model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    system: systemMessage,
    messages: chatMessages,
  })

  const latencyMs = Date.now() - startTime

  // Claude 응답에서 텍스트 추출
  const content = response.content
    .filter((block) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')

  return {
    content,
    provider: 'claude',
    model,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
    latencyMs,
  }
}

// Google Gemini API

async function callGemini(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')

  const genAI = new GoogleGenerativeAI(config.apiKey)
  const model = config.model ?? DEFAULT_MODELS.gemini

  // Gemini는 system instruction + 대화 히스토리 형태
  const systemMessage = messages.find((m) => m.role === 'system')?.content ?? ''
  const chatMessages = messages.filter((m) => m.role !== 'system')

  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemMessage,
    generationConfig: {
      maxOutputTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    },
  })

  // Gemini 대화 히스토리 포맷 변환
  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const lastMessage = chatMessages[chatMessages.length - 1]

  const startTime = Date.now()

  const chat = generativeModel.startChat({ history })
  const result = await chat.sendMessage(lastMessage?.content ?? '')
  const response = result.response

  const latencyMs = Date.now() - startTime

  const usageMetadata = response.usageMetadata

  return {
    content: response.text(),
    provider: 'gemini',
    model,
    usage: usageMetadata
      ? {
          promptTokens: usageMetadata.promptTokenCount ?? 0,
          completionTokens: usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: usageMetadata.totalTokenCount ?? 0,
        }
      : undefined,
    latencyMs,
  }
}

// LLM Call Wrapper

/**
 * LLM API를 호출합니다.
 *
 * @param messages  대화 메시지 배열 (system, user, assistant)
 * @param config    LLM 설정 (provider, apiKey, model 등)
 *
 * @example
 * const response = await callLLM(
 *   [
 *     { role: 'system', content: '프로젝트 관리 AI' },
 *     { role: 'user', content: '태스크 현황 알려줘' },
 *   ],
 *   { provider: 'openai', apiKey: 'sk-...' }
 * )
 */
export async function callLLM(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(messages, config)
    case 'claude':
      return callClaude(messages, config)
    case 'gemini':
      return callGemini(messages, config)
    default:
      throw new Error(`지원하지 않는 LLM provider: ${config.provider}`)
  }
}

// Utility: Load config from env
/**
 * 환경변수에서 LLM 설정을 로드합니다.
 *
 * 환경변수 규칙:
 *   OPENAI_API_KEY, CLAUDE_API_KEY (또는 ANTHROPIC_API_KEY), GEMINI_API_KEY (또는 GOOGLE_API_KEY)
 *   LLM_MODEL (선택)
 *   LLM_MAX_TOKENS (선택)
 *   LLM_TEMPERATURE (선택)
 */
export function loadConfigFromEnv(provider: LLMProvider): LLMConfig {
  let apiKey: string | undefined

  switch (provider) {
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY
      break
    case 'claude':
      apiKey = process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY
      break
    case 'gemini':
      apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
      break
  }

  if (!apiKey) {
    throw new Error(
      `API 키가 설정되지 않았습니다. .env 파일에 ${provider.toUpperCase()}_API_KEY를 설정해주세요.`
    )
  }

  return {
    provider,
    apiKey,
    model: process.env.LLM_MODEL,
    maxTokens: process.env.LLM_MAX_TOKENS
      ? parseInt(process.env.LLM_MAX_TOKENS, 10)
      : undefined,
    temperature: process.env.LLM_TEMPERATURE
      ? parseFloat(process.env.LLM_TEMPERATURE)
      : undefined,
  }
}
