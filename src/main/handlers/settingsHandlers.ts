import { IpcMain } from 'electron'
import { getPublicLLMSettings, updateLLMSettings } from '../services/settingsService'

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('settings:getLLM', () => {
    return getPublicLLMSettings()
  })

  ipcMain.handle(
    'settings:updateLLM',
    (_event, data: { provider?: 'openai'; model?: string; apiKey?: string; baseUrl?: string }) => {
      return updateLLMSettings(data)
    }
  )
}
