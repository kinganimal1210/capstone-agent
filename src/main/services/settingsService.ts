import Store from 'electron-store'

export interface LLMSettings {
  provider: 'openai'
  model: string
  apiKey: string
  baseUrl: string
}

interface AppSettings {
  llm: LLMSettings
}

export interface PublicLLMSettings {
  provider: 'openai'
  model: string
  baseUrl: string
  hasApiKey: boolean
}

export interface UpdateLLMSettingsInput {
  provider?: 'openai'
  model?: string
  apiKey?: string
  baseUrl?: string
}

const defaultLLMSettings: LLMSettings = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1'
}

const settingsStore = new Store<AppSettings>({
  name: 'settings',
  defaults: {
    llm: defaultLLMSettings
  }
})

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function toPublicSettings(settings: LLMSettings): PublicLLMSettings {
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    hasApiKey: Boolean(settings.apiKey || process.env.OPENAI_API_KEY)
  }
}

export function getStoredLLMSettings(): LLMSettings {
  const settings = settingsStore.get('llm') ?? defaultLLMSettings

  return {
    provider: 'openai',
    model: settings.model || defaultLLMSettings.model,
    apiKey: settings.apiKey || '',
    baseUrl: sanitizeBaseUrl(settings.baseUrl || defaultLLMSettings.baseUrl)
  }
}

export function getPublicLLMSettings(): PublicLLMSettings {
  return toPublicSettings(getStoredLLMSettings())
}

export function updateLLMSettings(input: UpdateLLMSettingsInput): PublicLLMSettings {
  const current = getStoredLLMSettings()

  const next: LLMSettings = {
    provider: input.provider ?? current.provider,
    model: input.model?.trim() || current.model,
    apiKey: input.apiKey !== undefined ? input.apiKey.trim() : current.apiKey,
    baseUrl: input.baseUrl ? sanitizeBaseUrl(input.baseUrl) : current.baseUrl
  }

  settingsStore.set('llm', next)
  return toPublicSettings(next)
}

export function getResolvedLLMSettings(): LLMSettings {
  const settings = getStoredLLMSettings()

  return {
    ...settings,
    apiKey: settings.apiKey || process.env.OPENAI_API_KEY || ''
  }
}
