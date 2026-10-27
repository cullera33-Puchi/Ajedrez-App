import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { ASK_INSTRUCTIONS, REPORT_SCHEMA, REPORT_TASK, SYSTEM_PROMPT } from '../shared/coachPrompts.ts'
import { claudeCodeAsk, claudeCodeReport, claudeCodeStatus, CoachCliError } from './claudeCode.ts'

/** Turno de conversación tal como lo guarda el navegador. */
type ChatTurn = { role: 'user'; text: string } | { role: 'assistant'; text?: string }

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * API local del entrenador. Vive dentro del servidor de Vite (npm run dev o npm run preview) y solo
 * usa Claude Code con la sesión del plan Pro o Max: nunca una clave de API ni ningún servicio de pago.
 */
export function coachPlugin(): Plugin {
  const status = async () => {
    const plan = await claudeCodeStatus()
    return { ready: plan.installed && plan.loggedIn && !plan.usesApiBilling, plan }
  }

  const requireReady = async () => {
    const s = await status()
    if (s.plan.usesApiBilling) {
      throw new HttpError(400, 'Claude Code está configurado con una clave de API y facturaría aparte. Ejecuta claude, escribe /login y entra con tu cuenta del plan.')
    }
  }

  const routes: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
    'GET /api/coach/status': status,

    'POST /api/coach/report': async (body) => {
      const context = requireString(body.context, 'context')
      await requireReady()
      return { report: await claudeCodeReport(SYSTEM_PROMPT, `${context}\n\n${REPORT_TASK}`, REPORT_SCHEMA) }
    },

    'POST /api/coach/ask': async (body) => {
      const context = requireString(body.context, 'context')
      const history = body.history as ChatTurn[] | undefined
      if (!Array.isArray(history) || !history.length || history[0].role !== 'user') throw new HttpError(400, 'Conversación vacía.')
      await requireReady()
      return askWithPlan(context, history, typeof body.sessionId === 'string' ? body.sessionId : undefined)
    },
  }

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0] ?? ''
    if (!url.startsWith('/api/coach/')) return next()
    const route = routes[`${req.method} ${url}`]
    try {
      if (!route) throw new HttpError(404, 'Ruta no encontrada.')
      if (req.method === 'POST') checkSameOrigin(req)
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

/**
 * Solo la propia app puede pedir informes: otra web abierta en el navegador no puede usar el plan de
 * Claude a escondidas. Se exige JSON (obliga al navegador a pedir permiso, que no se concede) y que el
 * origen de la petición sea el mismo servidor.
 */
function checkSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Formato no admitido.')
  if (origin && host && origin !== `http://${host}` && origin !== `https://${host}`) throw new HttpError(403, 'Petición no permitida.')
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Falta el campo ${name}.`)
  return v
}

function toHttpError(e: unknown): { status: number; message: string } {
  if (e instanceof HttpError) return { status: e.status, message: e.message }
  if (e instanceof CoachCliError) return { status: 502, message: e.message }
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
