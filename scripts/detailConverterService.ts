// 단순형 정본 변환기 — GODO 로컬 실행에 함께 붙는 실행 관리자.
//
// 하는 일은 셋뿐이다: ① 파이썬 실행환경 준비 ② 서버 기동 ③ GODO 종료 시 정리.
// 변환 규칙·Excel 읽기·HTML 출력·키 판별·초록/노랑/빨강 판정은 전부 `tools/detail-page-converter`
// 안의 정본 사용본이 하며, 이 파일은 그 코드를 읽지도 고치지도 않는다.
//
// 사용본은 원본 정본(`D:\변환기\detail-page-converter`, `8fe84e5`)의 소스 사본이다.
// 원본 폴더와 원본 `.venv` 에는 의존하지 않는다 — 실행환경을 GODO 안에 따로 만든다.
//
// 8000 포트가 이미 쓰이고 있으면 **아무것도 죽이지 않는다.** 안내만 찍고 GODO 는 계속 뜬다.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = path.join(ROOT, 'tools', 'detail-page-converter')
const VENV_DIR = path.join(ROOT, 'tools', '.venv-detail-converter')
// 변환 결과·캐시는 사용본 소스 폴더 밖에 쌓는다. 소스 폴더를 정본과 그대로 비교할 수 있어야 한다.
const WORK_DIR = path.join(ROOT, 'tools', 'converter-work')
const STAMP_FILE = path.join(VENV_DIR, 'godo-requirements.sha256')

export const CONVERTER_HOST = '127.0.0.1'
export const CONVERTER_PORT = 8000

const isWindows = process.platform === 'win32'
const tag = '[단순형 변환기]'
const say = (message: string): void => { console.log(`${tag} ${message}`) }

const venvPython = (): string =>
  isWindows ? path.join(VENV_DIR, 'Scripts', 'python.exe') : path.join(VENV_DIR, 'bin', 'python')

/** 이미 누가 그 포트를 쓰고 있는가. 연결만 해 보고 바로 끊는다. */
const portInUse = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host: CONVERTER_HOST, port })
    const done = (used: boolean): void => { socket.destroy(); resolve(used) }
    socket.setTimeout(1200)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

/** venv 를 만들 바탕 파이썬. 정본이 3.13 에서 도므로 그쪽을 먼저 찾는다. */
const basePython = (): string[] | null => {
  const candidates: string[][] = isWindows
    ? [['py', '-3.13'], ['py', '-3'], ['python']]
    : [['python3.13'], ['python3'], ['python']]
  for (const candidate of candidates) {
    const probe = spawnSync(candidate[0], [...candidate.slice(1), '-c', 'import sys; print(sys.version_info[:2])'], {
      encoding: 'utf-8',
      windowsHide: true,
    })
    if (probe.status === 0) return candidate
  }
  return null
}

const requirementsHash = (): string =>
  createHash('sha256').update(readFileSync(path.join(APP_DIR, 'requirements.txt'))).digest('hex')

/**
 * 준비 명령은 **비동기로** 돌린다. 동기 실행(spawnSync)으로 두면 첫 실행의 설치가
 * 끝날 때까지 GODO dev 서버 자체가 뜨지 않는다(실제로 그랬다).
 */
const run = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    const proc = spawn(command, args, { cwd: APP_DIR, stdio: 'inherit', windowsHide: true })
    proc.once('error', () => resolve(false))
    proc.once('exit', (code) => resolve(code === 0))
  })

/**
 * 실행환경 준비. 이미 준비돼 있으면 아무 일도 하지 않는다(몇 ms).
 * 처음 한 번만 venv 생성 + 설치로 몇 분 걸린다. 그동안 GODO 는 정상으로 뜬다.
 */
const ensureEnvironment = async (): Promise<boolean> => {
  const want = requirementsHash()
  const ready = existsSync(venvPython()) && existsSync(STAMP_FILE) && readFileSync(STAMP_FILE, 'utf-8').trim() === want
  if (ready) return true

  if (!existsSync(venvPython())) {
    const base = basePython()
    if (!base) {
      say('파이썬을 찾지 못했습니다. 파이썬을 설치하면 다음 실행 때 자동으로 준비됩니다.')
      return false
    }
    say('처음 한 번 실행환경을 만듭니다. 몇 분 걸립니다(다음부터는 몇 초).')
    if (!(await run(base[0], [...base.slice(1), '-m', 'venv', VENV_DIR]))) {
      say('실행환경 만들기에 실패했습니다. GODO 는 계속 씁니다.')
      return false
    }
  }

  say('필요한 것을 설치합니다.')
  const python = venvPython()
  await run(python, ['-m', 'pip', 'install', '--upgrade', '--disable-pip-version-check', '-q', 'pip'])
  if (!(await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', 'requirements.txt']))) {
    say('설치에 실패했습니다(인터넷 연결을 확인해 주세요). GODO 는 계속 씁니다.')
    return false
  }
  writeFileSync(STAMP_FILE, want, 'utf-8')
  return true
}

let child: ChildProcess | null = null
let starting = false
// 우리가 끈 것인지, 저 혼자 죽은 것인지 구분한다. 정상 종료를 사고처럼 알리지 않으려는 것이다.
let stopping = false

const forward = (chunk: Buffer): void => {
  const text = chunk.toString('utf-8').trimEnd()
  if (text) console.log(`${tag} ${text.split('\n').join(`\n${tag} `)}`)
}

/** GODO 로컬 실행과 함께 부른다. 실패해도 예외를 밖으로 던지지 않는다. */
export const startDetailConverter = async (): Promise<void> => {
  if (child || starting) return
  starting = true
  try {
    if (!existsSync(APP_DIR)) { say(`사용본이 없습니다: ${APP_DIR}`); return }

    // 준비를 먼저 한다. 포트가 막혀 오늘 못 띄우더라도 실행환경은 갖춰 두어야
    // "평소 실행만으로 준비된다"가 참이 된다.
    if (!(await ensureEnvironment())) return

    if (await portInUse(CONVERTER_PORT)) {
      say(`${CONVERTER_HOST}:${CONVERTER_PORT} 은 이미 다른 프로그램이 쓰고 있습니다.`)
      say('이미 켜 둔 변환기라면 그대로 쓰시면 됩니다. GODO 가 그 프로그램을 끄지 않습니다.')
      return
    }

    mkdirSync(WORK_DIR, { recursive: true })
    child = spawn(
      venvPython(),
      ['-m', 'uvicorn', 'app.server:app', '--host', CONVERTER_HOST, '--port', String(CONVERTER_PORT), '--log-level', 'warning'],
      { cwd: APP_DIR, env: { ...process.env, CONVERTER_WORK: WORK_DIR }, windowsHide: true },
    )
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.once('exit', (code) => {
      if (!stopping && code && code !== 0) say(`변환기가 멈췄습니다(코드 ${code}). GODO 는 계속 씁니다.`)
      child = null
    })
    say(`준비됐습니다 — 디자인팀 → [단순형 변환기(정본)] 에서 바로 열립니다. (http://${CONVERTER_HOST}:${CONVERTER_PORT})`)
  } catch (error) {
    say(`시작하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    starting = false
  }
}

/** GODO 를 끄면 함께 시작한 변환기도 끈다. 남의 프로세스는 건드리지 않는다. */
export const stopDetailConverter = (): void => {
  const running = child
  if (!running) return
  child = null
  stopping = true
  try {
    if (isWindows && running.pid) spawnSync('taskkill', ['/pid', String(running.pid), '/T', '/F'], { windowsHide: true })
    else running.kill()
  } catch {
    // 이미 죽었으면 할 일이 없다.
  }
}
