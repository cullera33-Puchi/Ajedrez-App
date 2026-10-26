import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { ASK_INSTRUCTIONS, REPORT_SCHEMA, REPORT_TASK, SYSTEM_PROMPT } from './prompts.ts'

export const COACH_MODEL = 'claude-opus-5-5'

type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam

/** Turno de conversación tal como lo guarda el navegador. Las respuestas de Claude se reenvían sin tocar. */
type ChatTurn = { role: 'user'; text: string } | { role: 'assistant'; content: BetaContentBlockParam[] }

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
}

/**
 * API local del entrenador. Vive dentro del servidor de Vite (npm run dev o npm run preview),
 * así la clave de Anthropic se queda en el PC y nunca llega al navegador.
 */
export function coachPlugin(opts: Options): Plugin {
  let apiKey = opts.apiKey
  let client: Anthropic | null = null

  const getClient = () => {
    if (!apiKey) throw new HttpError(400, 'Falta la clave de Claude. Configúrala en la pantalla de Inicio.')
    client ??= new Anthropic({ apiKey, baseURL: opts.baseURL })
    return client
  }

  const routes: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
    'GET /api/coach/status': async () => ({ configured: Boolean(apiKey), model: COACH_MODEL }),

    'POST /api/coach/key': async (body) => {
      const key = String(body.apiKey ?? '').trim()
      if (!/^sk-ant-[\w-]+$/.test(key)) throw new HttpError(400, 'La clave no tiene el formato esperado (empieza por sk-ant-).')
      saveKey(opts.root, key)
      apiKey = key
      client = null
      return { configured: true, model: COACH_MODEL }
    },

    'POST /api/coach/report': async (body) => {
      const context = requireString(body.context, 'context')
      const msg = await run(getClient(), {
        effort: 'high',
        format: { type: 'json_schema', schema: REPORT_SCHEMA },
        messages: [{ role: 'user', content: [{ type: 'text', text: context }, { type: 'text', text: REPORT_TASK }] }],
      })
      const text = textOf(msg)
      try {
        return { report: JSON.parse(text), usage: msg.usage }
      } catch {
        throw new HttpError(502, 'La respuesta de Claude no tiene el formato esperado. Vuelve a intentarlo.')
      }
    },

    'POST /api/coach/ask': async (body) => {
      const context = requireString(body.context, 'context')
      const history = body.history as ChatTurn[] | undefined
      if (!Array.isArray(history) || !history.length || history[0].role !== 'user') throw new HttpError(400, 'Conversación vacía.')
      // El historial solo crece por el final: el contexto va siempre igual en el primer mensaje y las
      // respuestas anteriores se reenvían tal cual (incluidos sus bloques de razonamiento).
      const messages: BetaMessageParam[] = history.map((turn, i) => {
        if (turn.role === 'assistant') return { role: 'assistant', content: turn.content }
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
      return { content: msg.content, text: textOf(msg), usage: msg.usage }
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

/** Guarda la clave en .env.local (ignorado por git) para que se conserve entre arranques. */
function saveKey(root: string, key: string) {
  const file = path.join(root, '.env.local')
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : []
  const kept = lines.filter((l) => l.trim() && !l.startsWith('ANTHROPIC_API_KEY='))
  fs.writeFileSync(file, [...kept, `ANTHROPIC_API_KEY=${key}`, ''].join('\n'), { mode: 0o600 })
}
