import { useCallback, useEffect, useRef } from 'react'

/**
 * Keep one worker alive for the component's lifetime. If the worker dies (typically out
 * of memory), `onCrash` is called and a fresh worker is created on the next `post`.
 */
export function useWorker<Req, Res>(
  create: () => Worker,
  onMessage: (msg: Res) => void,
  onCrash: () => void,
): (msg: Req, transfer?: Transferable[]) => void {
  const workerRef = useRef<Worker | null>(null)
  const handlers = useRef({ onMessage, onCrash, create })
  handlers.current = { onMessage, onCrash, create }

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  return useCallback((msg: Req, transfer: Transferable[] = []) => {
    if (!workerRef.current) {
      const w = handlers.current.create()
      w.onmessage = (e: MessageEvent<Res>) => handlers.current.onMessage(e.data)
      const crash = () => {
        w.terminate()
        if (workerRef.current === w) workerRef.current = null
        handlers.current.onCrash()
      }
      w.onerror = (e) => {
        e.preventDefault()
        crash()
      }
      w.onmessageerror = crash
      workerRef.current = w
    }
    workerRef.current.postMessage(msg, transfer)
  }, [])
}
