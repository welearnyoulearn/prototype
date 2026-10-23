"use client"

import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { GRADE_SEQUENCE } from "@/lib/grades"
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from "@/components/ui/popover"

const ALL_GRADES = GRADE_SEQUENCE.filter((g) => /^\d+$/.test(g))

interface GradesMultiSelectProps {
  value: string
  onChange: (v: string) => void
  /** Trigger gets `${testIdBase}s-trigger`, each grade button `${testIdBase}-{g}`. */
  testIdBase: string
  size?: "sm" | "md"
  align?: "start" | "end"
  panelWidth?: number
  emptyLabel?: string
  /** Text between "Grade(s)" and the selected list, e.g. ": " or " ". */
  labelSeparator?: string
}

function GradesMultiSelect({
  value,
  onChange,
  testIdBase,
  size = "md",
  align = "start",
  panelWidth = 260,
  emptyLabel = "All grades",
  labelSeparator = " ",
}: GradesMultiSelectProps) {
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []
  const allSelected = selected.length === ALL_GRADES.length

  function toggle(g: string) {
    const next = selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g]
    onChange(next.sort((a, b) => parseInt(a) - parseInt(b)).join(","))
  }

  const label =
    selected.length === 0
      ? emptyLabel
      : allSelected
      ? "All grades (1–10)"
      : `Grade${selected.length > 1 ? "s" : ""}${labelSeparator}${selected.join(", ")}`

  const isSm = size === "sm"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${testIdBase}s-trigger`}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border bg-white text-left transition-colors",
            "border-gray-200 hover:border-gray-300 data-[state=open]:border-blue-400 data-[state=open]:ring-2 data-[state=open]:ring-blue-100",
            isSm ? "min-w-[120px] px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          )}
        >
          <span className={cn("truncate", selected.length ? "font-medium text-gray-900" : "text-gray-400")}>
            {label}
          </span>
          <ChevronDownIcon
            className={cn(
              "shrink-0 text-gray-400 transition-transform",
              isSm ? "size-3.5" : "size-4"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="overflow-hidden rounded-xl border-gray-200 p-0 shadow-lg"
        style={{ width: panelWidth }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
          <span className="text-xs font-semibold text-gray-600">Teaches Grades</span>
          <span className={cn("text-gray-400", isSm ? "text-[10px]" : "text-[11px]")}>
            {selected.length === 0 ? "All grades" : `${selected.length} selected`}
          </span>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-5 gap-1.5">
            {ALL_GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                data-testid={`${testIdBase}-${g}`}
                className={cn(
                  "rounded-lg font-semibold transition-colors",
                  isSm ? "h-8 text-xs" : "h-9 text-sm",
                  selected.includes(g)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onChange(ALL_GRADES.join(","))}
              className={cn("font-medium text-blue-600 hover:text-blue-800", isSm ? "text-[11px]" : "text-xs")}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className={cn("font-medium text-gray-500 hover:text-gray-700", isSm ? "text-[11px]" : "text-xs")}
            >
              Clear
            </button>
          </div>
          <PopoverClose
            className={cn(
              "rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700",
              isSm ? "px-3 py-1 text-[11px]" : "px-3 py-1 text-xs"
            )}
          >
            Done
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { GradesMultiSelect }
