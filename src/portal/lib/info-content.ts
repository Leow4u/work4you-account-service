/** Static Info page copy — mirrors website/docs/integrations/work4you-portal.md */

export const WORK4YOU_4_MODELS = ['Work4You-4-70B', 'Work4You-4-405B'] as const

export const AGENTIC_MODEL_SUGGESTIONS = [
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', note: 'Melhor uso geral no agente' },
  { id: 'openai/gpt-5.5-pro', label: 'GPT-5.5 Pro', note: 'Raciocínio + tool calling' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', note: 'Janela de contexto grande' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'Código com bom custo' },
] as const

export const TOOL_GATEWAY_ROWS = [
  { tool: 'Pesquisa e extração web', partner: 'Firecrawl' },
  { tool: 'Geração de imagem', partner: 'FAL' },
  { tool: 'Texto para voz', partner: 'OpenAI TTS' },
  { tool: 'Automação de browser', partner: 'Browser Use' },
  { tool: 'Terminal na nuvem (opcional)', partner: 'Modal' },
] as const

export const EXTERNAL_LINKS = [
  {
    label: 'Documentação Work4You Portal',
    href: 'https://work4you.ai/docs/integrations/work4you-portal',
  },
  {
    label: 'Guia: correr Work4You com o Portal',
    href: 'https://work4you.ai/docs/guides/run-work4you-with-work4you-portal',
  },
  {
    label: 'Tool Gateway',
    href: 'https://work4you.ai/docs/user-guide/features/tool-gateway',
  },
  {
    label: 'Gerir subscrição',
    href: 'https://portal.work4you.ai/manage-subscription',
  },
  {
    label: 'work4you.ai',
    href: 'https://work4you.ai/',
  },
] as const
