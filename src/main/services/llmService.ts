import https from 'https'
import { URL } from 'url'
import type { EvidenceItem, ToolType } from '../../shared/types'
import { getResolvedLLMSettings } from './settingsService'

interface GenerateProjectAnalysisInput {
  projectName: string
  tool: ToolType
  prompt: string
  evidence: EvidenceItem[]
}

interface OpenAIResponseUsage {
  total_tokens?: number
}

interface OpenAIResponseText {
  type?: string
  text?: string
}

interface OpenAIResponseOutputItem {
  content?: OpenAIResponseText[]
}

interface OpenAIResponsesApiResponse {
  output_text?: string
  output?: OpenAIResponseOutputItem[]
  usage?: OpenAIResponseUsage
  error?: {
    message?: string
  }
}

export interface GeneratedProjectAnalysis {
  summary: string
  suggestedActions: string[]
  rawResponse: string
  model: string
  tokenUsed?: number
}

function postJson<T>(urlString: string, apiKey: string, body: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString)
    const payload = JSON.stringify(body)

    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as T & { error?: { message?: string } }
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error?.message || `LLM API 요청 실패 (${res.statusCode})`))
              return
            }
            resolve(parsed)
          } catch {
            reject(new Error('LLM API 응답을 JSON으로 해석하지 못했습니다.'))
          }
        })
      }
    )

    req.on('error', (error) => {
      reject(error)
    })

    req.setTimeout(30000, () => {
      req.destroy(new Error('LLM API 요청 시간이 초과되었습니다.'))
    })

    req.write(payload)
    req.end()
  })
}

function buildEvidenceContext(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) {
    return '선택된 데이터 소스에서 아직 근거 데이터가 없습니다.'
  }

  return evidence
    .map((item, index) => {
      const dateLine = item.date ? `날짜: ${item.date}\n` : ''
      return [
        `[Evidence ${index + 1}]`,
        `ID: ${item.id}`,
        `Source: ${item.source}`,
        `Title: ${item.title}`,
        dateLine ? dateLine.trimEnd() : null,
        `Content: ${item.content}`
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

function extractOutputText(response: OpenAIResponsesApiResponse): string {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const parts: string[] = []
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) {
        parts.push(content.text.trim())
      }
    }
  }

  return parts.join('\n').trim()
}

function safeJsonParse(rawText: string): { summary?: string; suggestedActions?: string[] } | null {
  try {
    return JSON.parse(rawText) as { summary?: string; suggestedActions?: string[] }
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return JSON.parse(match[0]) as { summary?: string; suggestedActions?: string[] }
    } catch {
      return null
    }
  }
}

export async function generateProjectAnalysis(input: GenerateProjectAnalysisInput): Promise<GeneratedProjectAnalysis> {
  const settings = getResolvedLLMSettings()

  if (!settings.apiKey) {
    throw new Error('LLM API 키가 설정되지 않았습니다. Settings에서 API Key를 저장하세요.')
  }

  if (settings.provider !== 'openai') {
    throw new Error(`지원하지 않는 LLM provider입니다: ${settings.provider}`)
  }

  const instructions = [
    'You analyze software project progress using provided evidence only.',
    'Return valid JSON only.',
    'Schema: {"summary":"string","suggestedActions":["string","string"]}',
    'Write the response in Korean.',
    'Do not invent evidence that is not present in the context.'
  ].join(' ')

  const requestInput = [
    `프로젝트명: ${input.projectName}`,
    `선택 도구: ${input.tool}`,
    `사용자 질문: ${input.prompt}`,
    '',
    '[근거 데이터]',
    buildEvidenceContext(input.evidence)
  ].join('\n')

  const response = await postJson<OpenAIResponsesApiResponse>(
    `${settings.baseUrl}/responses`,
    settings.apiKey,
    {
      model: settings.model,
      instructions,
      input: requestInput
    }
  )

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  const outputText = extractOutputText(response)
  if (!outputText) {
    throw new Error('LLM이 비어 있는 응답을 반환했습니다.')
  }

  const parsed = safeJsonParse(outputText)
  const summary = parsed?.summary?.trim() || outputText
  const suggestedActions = Array.isArray(parsed?.suggestedActions)
    ? parsed!.suggestedActions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    summary,
    suggestedActions,
    rawResponse: outputText,
    model: settings.model,
    tokenUsed: response.usage?.total_tokens
  }
}
