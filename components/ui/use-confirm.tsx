"use client"

import { useCallback, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  /** Styles the confirm button as destructive (red) for irreversible actions. */
  destructive?: boolean
}

/**
 * Drop-in replacement for `window.confirm()` that resolves the same way
 * (Promise<boolean>) but renders the shared AlertDialog instead of the
 * unstyled native browser dialog. Mount the returned `ConfirmDialog` once
 * near the component's return, then `await confirm('Delete this?')`.
 */
function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    message: string
    title: string
    confirmText: string
    cancelText: string
    destructive: boolean
  }>({
    open: false,
    message: "",
    title: "Are you sure?",
    confirmText: "Confirm",
    cancelText: "Cancel",
    destructive: false,
  })
  const resolver = useRef<(value: boolean) => void>(null)

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    setState({
      open: true,
      message,
      title: options?.title ?? "Are you sure?",
      confirmText: options?.confirmText ?? "Confirm",
      cancelText: options?.cancelText ?? "Cancel",
      destructive: options?.destructive ?? false,
    })
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function settle(result: boolean) {
    setState((s) => ({ ...s, open: false }))
    resolver.current?.(result)
    resolver.current = null
  }

  const ConfirmDialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{state.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {state.cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={
              state.destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
          >
            {state.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, ConfirmDialog }
}

export { useConfirm }
