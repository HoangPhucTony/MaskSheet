/// <reference lib="webworker" />
import { readWorkbook, writeWorkbook } from '../lib/io'
import { parseMapping } from '../lib/mapping'
import { unmaskText, unmaskWorkbook } from '../lib/unmasker'
import { toWorkerError, type UnmaskRequest, type UnmaskResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

function post(msg: UnmaskResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer)
}

self.onmessage = (e: MessageEvent<UnmaskRequest>) => {
  const msg = e.data
  let mapping
  try {
    mapping = parseMapping(msg.mappingJson)
  } catch (err) {
    return post(toWorkerError(err, 'mapping'))
  }

  if (msg.type === 'unmask-text') {
    try {
      const { text, stats } = unmaskText(msg.text, mapping)
      post({ type: 'unmasked-text', text, stats })
    } catch (err) {
      post(toWorkerError(err))
    }
    return
  }

  let wb, format
  try {
    ;({ wb, format } = readWorkbook(msg.buffer, msg.fileName))
  } catch (err) {
    return post(toWorkerError(err, 'read-failed'))
  }
  try {
    const stats = unmaskWorkbook(wb, mapping, (done, total) => post({ type: 'progress', done, total }))
    const bytes = writeWorkbook(wb, format)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    post({ type: 'unmasked-file', buffer, format, stats }, [buffer])
  } catch (err) {
    post(toWorkerError(err))
  }
}
