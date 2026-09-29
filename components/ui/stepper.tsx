import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface StepperProps extends React.ComponentProps<"ol"> {
  steps: string[]
  currentStep: number
}

function Stepper({ steps, currentStep, className, ...props }: StepperProps) {
  return (
    <ol
      data-slot="stepper"
      className={cn("flex w-full items-center", className)}
      {...props}
    >
      {steps.map((label, index) => {
        const stepNum = index + 1
        const isComplete = stepNum < currentStep
        const isCurrent = stepNum === currentStep
        const isLast = index === steps.length - 1

        return (
          <li
            key={label}
            data-slot="stepper-item"
            data-state={isComplete ? "complete" : isCurrent ? "current" : "upcoming"}
            className={cn("flex items-center", !isLast && "flex-1")}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors duration-[var(--motion-transition)]",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary",
                  !isComplete && !isCurrent && "border-input text-muted-foreground"
                )}
              >
                {isComplete ? <CheckIcon className="size-4" /> : stepNum}
              </span>
              <span
                className={cn(
                  "hidden text-xs whitespace-nowrap sm:block",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mx-2 h-px flex-1 transition-colors duration-[var(--motion-transition)]",
                  isComplete ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export { Stepper }
