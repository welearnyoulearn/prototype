import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Styled wrapper around the native date input — keeps the OS-native picker
 * (best mobile UX, no extra dependency) while matching the shared Input look.
 */
function DatePicker({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <input
        type="date"
        data-slot="date-picker"
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          className
        )}
        {...props}
      />
      <CalendarIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { DatePicker }
