import spawn from 'cross-spawn'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Llama a Claude a través de Claude Code instalado en el PC (modo no interactivo, `claude -p`).
 * Usa la sesión iniciada con la cuenta del plan Pro o Max, así que no hay coste aparte.
 */

export interface ClaudeCodeStatus {
  installed: boolean
  loggedIn: boolean
  authMethod?: string
  /** true si Claude Code está configurado para facturar por API en lugar de usar el plan. */
  usesApiBilling: boolean
}

interface CliResult {
  is_error?: boolean
  result?: string
  session_id?: string
  structured_output?: unknown
  subtype?: string
}

const WORK_DIR = path.join(os.homedir(), '.ajedrez-app', 'claude')
const REPORT_TIMEOUT_MS = 6 * 60_000
const ASK_TIMEOUT_MS = 4 * 60_000

/**
 * Entorno para Claude Code sin variables que lo harían facturar aparte (clave de API, Bedrock,
 * Vertex o Foundry): así siempre usa la sesión del plan. También se quitan las variables que
 * identifican una sesión de Claude Code padre, por si la app se arranca desde una.
 */
const STRIPPED_ENV = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
]

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of STRIPPED_ENV) delete env[k]
  return env
}

function runCli(args: string[], input: string, timeoutMs: number): Promise<string> {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: WORK_DIR, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new CoachCliError('Claude ha tardado demasiado en responder. Vuelve a intentarlo.'))
    }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (d: string) => (out += d))
    child.stderr?.setEncoding('utf8').on('data', (d: string) => (err += d))
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        e.code === 'ENOENT'
          ? new CoachCliError('No se encuentra Claude Code en este PC. Instálalo e inicia sesión con tu cuenta (ver Inicio).')
          : e,
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || out.trim().startsWith('{')) resolve(out)
      else reject(new CoachCliError(cliErrorMessage(err || out)))
    })
    child.stdin?.end(input, 'utf8')
  })
}

export class CoachCliError extends Error {}

function cliErrorMessage(text: string): string {
  if (/log ?in|not logged|authenticat|\/login/i.test(text)) return 'Claude Code no tiene la sesión iniciada. Abre una terminal, ejecuta claude e inicia sesión con tu cuenta.'
  if (/usage limit|rate limit|limit reached/i.test(text)) return 'Has llegado al límite de uso de tu plan de Claude. Espera a que se renueve y vuelve a intentarlo.'
  const line = text.trim().split('\n').pop() ?? ''
  return `Claude Code ha devuelto un error${line ? `: ${line.slice(0, 200)}` : '.'}`
}

function parseResult(out: string): CliResult {
  let r: CliResult
  try {
    r = JSON.parse(out) as CliResult
  } catch {
    throw new CoachCliError('La respuesta de Claude Code no tiene el formato esperado.')
  }
  if (r.is_error) throw new CoachCliError(cliErrorMessage(r.result ?? r.subtype ?? ''))
  return r
}

function systemPromptFile(systemPrompt: string): string {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  const file = path.join(WORK_DIR, 'entrenador.txt')
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== systemPrompt) fs.writeFileSync(file, systemPrompt)
  return file
}

/** Opciones comunes: modelo Opus, sin herramientas, sin MCP ni ajustes del usuario, salida JSON. */
function baseArgs(systemPrompt: string, effort: 'medium' | 'high'): string[] {
  return [
    '-p',
    '--output-format', 'json',
    '--model', 'opus',
    '--effort', effort,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', 'project',
    '--system-prompt-file', systemPromptFile(systemPrompt),
  ]
}

export async function claudeCodeStatus(): Promise<ClaudeCodeStatus> {
  try {
    const out = await runCli(['auth', 'status', '--json'], '', 20_000)
    const s = JSON.parse(out) as { loggedIn?: boolean; authMethod?: string }
    return {
      installed: true,
      loggedIn: Boolean(s.loggedIn),
      authMethod: s.authMethod,
      usesApiBilling: /api/i.test(s.authMethod ?? ''),
    }
  } catch (e) {
    const notInstalled = e instanceof CoachCliError && /No se encuentra/.test(e.message)
    return { installed: !notInstalled, loggedIn: false, usesApiBilling: false }
  }
}

export async function claudeCodeReport(systemPrompt: string, prompt: string, schema: object): Promise<unknown> {
  const args = [...baseArgs(systemPrompt, 'high'), '--no-session-persistence', '--json-schema', JSON.stringify(schema)]
  const r = parseResult(await runCli(args, prompt, REPORT_TIMEOUT_MS))
  if (r.structured_output) return r.structured_output
  try {
    return JSON.parse(r.result ?? '')
  } catch {
    throw new CoachCliError('La respuesta de Claude no tiene el formato esperado. Vuelve a intentarlo.')
  }
}

/** Pregunta al entrenador. Con sessionId continúa la conversación anterior de Claude Code. */
export async function claudeCodeAsk(systemPrompt: string, prompt: string, sessionId?: string): Promise<{ text: string; sessionId?: string }> {
  const args = [...baseArgs(systemPrompt, 'medium'), ...(sessionId ? ['--resume', sessionId] : [])]
  const r = parseResult(await runCli(args, prompt, ASK_TIMEOUT_MS))
  return { text: r.result ?? '', sessionId: r.session_id }
}
