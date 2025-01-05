import fs from 'fs'
import { Plugin, type DevEnvironment } from 'vite'
import init from '../slang-wasm/slang-wasm.js'
import { RollupError } from 'rollup'
import path from 'path'

const VITE_PLUGIN_NAME = 'vite-plugin-slang'
const idRegex = /\.slang(\?(wgsl|glsl))?$/i

class SlangError extends Error {
  type: string
  constructor(type: string, message: string) {
    super(`${type}: ${message}`)
    this.type = type
    this.name = 'SlangError'
  }
}

function detectImports(code: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+([^"';]+);/g
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(code))) {
    imports.push(match[1].replaceAll('.', path.sep).replaceAll('_', '-').replace('.slang', ''))
  }
  return imports
}

async function loadModule(
  Slang: any,
  session: any,
  id: string,
  root: string,
  dependencies: string[]
): Promise<[any[], string[]]> {
  let data: string
  const name = path.relative(root, id).replace('.slang', '').replaceAll('../', '')
  const modules: any[] = []
  try {
    data = await fs.promises.readFile(id, 'utf8')
  } catch (e) {
    throw new Error(`Could not resolve import: ${id}`)
  }
  const imports = detectImports(data)
  for (const _imp of imports) {
    let imp = path.resolve(root, _imp + '.slang')
    while (!fs.existsSync(imp)) {
      const parent = path.resolve(path.dirname(imp), '..', path.basename(imp))
      if (parent === imp) {
        throw new Error(`Could not resolve import: ${_imp}`)
      }
      imp = parent
      console.log(imp)
    }
    if (!dependencies.includes(imp)) {
      const [_modules] = await loadModule(Slang, session, imp, root, dependencies)
      modules.push(..._modules)
      dependencies.push(imp)
    }
  }
  const module = session.loadModuleFromSource(data, name, id)
  if (!module) {
    const err = Slang.getLastError()
    throw new SlangError(err.type, err.message)
  }
  modules.push(module)
  return [modules, dependencies]
}

function getCompileTargetId(Slang: any, target: string): number {
  const targets = Slang.getCompileTargets()
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].name.toLowerCase() === target.toLowerCase()) {
      return targets[i].value
    }
  }
  throw new Error(`Invalid compile target: ${target}`)
}

export default function viteSlangPlugin(): Plugin {
  return {
    name: VITE_PLUGIN_NAME,
    enforce: 'pre',

    async load(_id: string) {
      const match = _id.match(idRegex)
      if (match) {
        const id = _id.split('?')[0]
        const target = match[2] || 'wgsl'
        const { moduleGraph } = this.environment as DevEnvironment
        const thisModule = moduleGraph.getModuleById(id)
        const root = path.dirname(id)

        try {
          const Slang = await init()
          const targetId = getCompileTargetId(Slang, target)
          const globalSession = Slang.createGlobalSession()
          const session = globalSession.createSession(targetId)
          if (!session) {
            const err = Slang.getLastError()
            throw new SlangError(err.type, err.message)
          }
          const [modules, dependencies] = await loadModule(Slang, session, id, root, [])

          const program = session.createCompositeComponentType(modules)
          if (!program) {
            const err = Slang.getLastError()
            throw new SlangError(err.type, err.message)
          }
          const linkedProgram = program.link()
          if (!linkedProgram) {
            const err = Slang.getLastError()
            throw new SlangError(err.type, err.message)
          }
          const code = linkedProgram.getTargetCode(0)
          if (!code) {
            const err = Slang.getLastError()
            throw new SlangError(err.type, err.message)
          }

          // add dependencies to module graph for HMR
          if (thisModule) {
            let graphModules = dependencies.map((dep) => {
              return moduleGraph.createFileOnlyEntry(dep)
            })
            moduleGraph.updateModuleInfo(thisModule, new Set(graphModules), null, new Set(), null, false)
          }

          return `export default \`${code}\``
        } catch (err) {
          if (err instanceof Error) {
            const rollupErr = new Error(err.message) as RollupError
            rollupErr.plugin = VITE_PLUGIN_NAME
            rollupErr.loc = { line: 0, column: 0 }
            rollupErr.id = id
            throw rollupErr
          }
        }
      }
    },
  }
}
