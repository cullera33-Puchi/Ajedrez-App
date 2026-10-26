import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { ASK_INSTRUCTIONS, REPORT_SCHEMA, REPORT_TASK, SYSTEM_PROMPT } from '../shared/coachPrompts.ts'
import { claudeCodeAsk, claudeCodeReport, claudeCodeStatus, CoachCliError } from './claudeCode.ts'

export const COACH_MODEL = 'claude-opus-5-5'

/** plan: Claude Code con la cuenta Pro o Max (sin coste aparte). api: clave de Anthropic (pago por uso). */
export type CoachProvider = 'plan' | 'api'

type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam

/** Turno de conversación tal como lo guarda el navegador. Las respuestas de Claude se reenvían sin tocar. */
type ChatTurn = { role: 'user'; text: string } | { role: 'assistant'; content?: BetaContentBlockParam[]; text?: string }

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Options {
  /** Carpeta del proyecto, donde se guarda .env.local. */
  root: string
  apiKey?: string
  baseURL?: string
  provider?: string
}

/**
 * API local del entrenador. Vive dentro del servidor de Vite (npm run dev o npm run preview),
 * así la clave de Anthropic se queda en el PC y nunca llega al navegador.
 */
export function coachPlugin(opts: Options): Plugin {
  let apiKey = opts.apiKey
  let client: Anthropic | null = null
  let provider: CoachProvider = opts.provider === 'api' ? 'api' : 'plan'

  const getClient = () => {
    if (!apiKey) throw new HttpError(400, 'Falta la clave de Claude. Configúrala en la pantalla de Inicio.')
    client ??= new Anthropic({ apiKey, baseURL: opts.baseURL })
    return client
  }

  const status = async () => {
    const plan = await claudeCodeStatus()
    const ready = provider === 'plan' ? plan.installed && plan.loggedIn : Boolean(apiKey)
    return { provider, ready, plan, api: { configured: Boolean(apiKey), model: COACH_MODEL } }
  }

  const routes: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
    'GET /api/coach/status': status,

    'POST /api/coach/provider': async (body) => {
      if (body.provider !== 'plan' && body.provider !== 'api') throw new HttpError(400, 'Opción no válida.')
      provider = body.provider
      saveEnv(opts.root, 'COACH_PROVIDER', provider)
      return status()
    },

    'POST /api/coach/key': async (body) => {
      const key = String(body.apiKey ?? '').trim()
      if (!/^sk-ant-[\w-]+$/.test(key)) throw new HttpError(400, 'La clave no tiene el formato esperado (empieza por sk-ant-).')
      saveEnv(opts.root, 'ANTHROPIC_API_KEY', key)
      apiKey = key
      client = null
      return status()
    },

    'POST /api/coach/report': async (body) => {
      const context = requireString(body.context, 'context')
      if (provider === 'plan') {
        return { report: await claudeCodeReport(SYSTEM_PROMPT, `${context}\n\n${REPORT_TASK}`, REPORT_SCHEMA) }
      }
      const msg = await run(getClient(), {
        effort: 'high',
        format: { type: 'json_schema', schema: REPORT_SCHEMA },
        messages: [{ role: 'user', content: [{ type: 'text', text: context }, { type: 'text', text: REPORT_TASK }] }],
      })
      const text = textOf(msg)
      try {
        return { report: JSON.parse(text) }
      } catch {
        throw new HttpError(502, 'La respuesta de Claude no tiene el formato esperado. Vuelve a intentarlo.')
      }
    },

    'POST /api/coach/ask': async (body) => {
      const context = requireString(body.context, 'context')
      const history = body.history as ChatTurn[] | undefined
      if (!Array.isArray(history) || !history.length || history[0].role !== 'user') throw new HttpError(400, 'Conversación vacía.')
      if (provider === 'plan') return askWithPlan(context, history, typeof body.sessionId === 'string' ? body.sessionId : undefined)

      // El historial solo crece por el final: el contexto va siempre igual en el primer mensaje y las
      // respuestas anteriores se reenvían tal cual (incluidos sus bloques de razonamiento).
      const messages: BetaMessageParam[] = history.map((turn, i) => {
        if (turn.role === 'assistant') return { role: 'assistant', content: turn.content ?? turn.text ?? '' }
        if (i === 0) {
          return {
            role: 'user',
            content: [
              { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `${ASK_INSTRUCTIONS}\n\n${turn.text}` },
            ],
          }
        }
        return { role: 'user', content: turn.text }
      })
      const msg = await run(getClient(), { effort: 'medium', messages })
      return { content: msg.content, text: textOf(msg) }
    },
  }

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0] ?? ''
    if (!url.startsWith('/api/coach/')) return next()
    const route = routes[`${req.method} ${url}`]
    try {
      if (!route) throw new HttpError(404, 'Ruta no encontrada.')
      const body = req.method === 'POST' ? await readJson(req) : {}
      send(res, 200, await route(body))
    } catch (e) {
      const { status, message } = toHttpError(e)
      if (status >= 500) console.error('[entrenador]', e)
      send(res, status, { error: message })
    }
  }

  return {
    name: 'coach-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

async function run(
  client: Anthropic,
  opts: {
    effort: 'medium' | 'high'
    messages: BetaMessageParam[]
    format?: { type: 'json_schema'; schema: Record<string, unknown> }
  },
): Promise<BetaMessage> {
  const stream = client.beta.messages.stream({
    model: COACH_MODEL,
    max_tokens: 32000,
    // Si el modelo declina por política, la API reintenta en el modelo alternativo recomendado.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: opts.effort, ...(opts.format ? { format: opts.format } : {}) },
    system: SYSTEM_PROMPT,
    messages: opts.messages,
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new HttpError(422, 'Claude no ha podido responder a esta petición. Prueba a reformularla.')
  if (msg.stop_reason === 'max_tokens') throw new HttpError(502, 'La respuesta de Claude ha quedado incompleta. Vuelve a intentarlo.')
  return msg
}

const textOf = (msg: BetaMessage) =>
  msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

function requireString(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Falta el campo ${name}.`)
  return v
}

function toHttpError(e: unknown): { status: number; message: string } {
  if (e instanceof HttpError) return { status: e.status, message: e.message }
  if (e instanceof CoachCliError) return { status: 502, message: e.message }
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, message: 'La clave de Claude no es válida. Revísala en Inicio.' }
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 403, message: 'La clave de Claude no tiene permiso para usar este modelo.' }
  if (e instanceof Anthropic.RateLimitError) return { status: 429, message: 'Has alcanzado el límite de uso de Claude. Espera un poco y vuelve a intentarlo.' }
  if (e instanceof Anthropic.BadRequestError) return { status: 400, message: `Claude ha rechazado la petición: ${e.message}` }
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, message: 'No se ha podido conectar con Claude. Revisa tu conexión a internet.' }
  if (e instanceof Anthropic.APIError) return { status: 502, message: `Error de Claude (${e.status ?? 'sin código'}). Vuelve a intentarlo.` }
  return { status: 500, message: 'Error inesperado en el servidor local.' }
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
      if (raw.length > 2_000_000) reject(new HttpError(413, 'Petición demasiado grande.'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new HttpError(400, 'JSON no válido.'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/**
 * Pregunta usando Claude Code. Con sesión abierta solo se envía la nueva pregunta; si no la hay
 * (primera pregunta, o la conversación empezó por otra vía) se envía el contexto y lo hablado hasta ahora.
 */
async function askWithPlan(context: string, history: ChatTurn[], sessionId?: string) {
  const last = history[history.length - 1]
  if (last.role !== 'user') throw new HttpError(400, 'Falta la pregunta.')
  if (sessionId) return claudeCodeAsk(SYSTEM_PROMPT, last.text, sessionId)
  const previous = history
    .slice(0, -1)
    .map((t) => (t.role === 'user' ? `Alumno: ${t.text}` : `Entrenador: ${t.text ?? ''}`))
    .join('\n\n')
  const prompt = [context, ASK_INSTRUCTIONS, previous && `Conversación hasta ahora:\n${previous}`, last.text].filter(Boolean).join('\n\n')
  return claudeCodeAsk(SYSTEM_PROMPT, prompt)
}

/** Guarda un valor en .env.local (ignorado por git) para que se conserve entre arranques. */
function saveEnv(root: string, name: string, value: string) {
  const file = path.join(root, '.env.local')
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : []
  const kept = lines.filter((l) => l.trim() && !l.startsWith(`${name}=`))
  fs.writeFileSync(file, [...kept, `${name}=${value}`, ''].join('\n'), { mode: 0o600 })
}
