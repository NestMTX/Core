import type {
  $ as $Fn,
  execaSync as ExecSyncFn,
  execaCommand as ExecaCommandFn,
  execaCommandSync as ExecaCommandSyncFn,
  execa as ExecaFn,
  execaNode as ExecaNodeFn,
} from 'execa'

export interface ExecaModule {
  execa: typeof ExecaFn
  execaSync: typeof ExecSyncFn
  execaCommand: typeof ExecaCommandFn
  execaCommandSync: typeof ExecaCommandSyncFn
  $: typeof $Fn
  execaNode: typeof ExecaNodeFn
}

export async function getExecaModule() {
  const execa = (await new Promise((_resolve) => {
    // eslint-disable-next-line no-eval -- this is needed to ensure that execa is imported dynamically fulfilling the esm requirements
    eval("import('execa').then(_resolve)")
  })) as ExecaModule
  return execa
}
