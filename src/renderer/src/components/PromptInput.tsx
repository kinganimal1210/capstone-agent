import { Send, Loader2 } from 'lucide-react'
import { useState } from 'react'

const examplePrompts = [
  '현재 프로젝트의 진행상황 알려줘',
  '지난 회의 이후 아직 안 끝난 일 알려줘',
  '중간발표 기준 현재 상태 요약해줘',
]

interface PromptInputProps {
  onSubmit: (prompt: string) => void
  disabled: boolean
  isLoading: boolean
}

export function PromptInput({ onSubmit, disabled, isLoading }: PromptInputProps) {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim() && !disabled && !isLoading) {
      onSubmit(prompt)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-foreground text-base">Query</h3>
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="프로젝트에 대해 질문하세요..."
          disabled={disabled || isLoading}
          className="w-full h-24 px-4 py-3 pr-12 bg-input-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        />
        <button
          type="submit"
          disabled={disabled || isLoading || !prompt.trim()}
          className="absolute right-3 bottom-3 p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">예시 질문:</p>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((example, i) => (
            <button
              key={i}
              onClick={() => !disabled && !isLoading && setPrompt(example)}
              disabled={disabled || isLoading}
              className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
