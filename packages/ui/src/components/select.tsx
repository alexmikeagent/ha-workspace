"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { Check, ChevronsUpDown } from "./icons"

const Select = SelectPrimitive.Root

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 flex-1 truncate text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 font-sans text-[13px] leading-5 text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-[var(--border-hover)] hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 data-popup-open:border-[var(--border-hover)] data-popup-open:bg-muted motion-reduce:transition-none max-[760px]:h-11 max-[760px]:text-base [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
        <ChevronsUpDown size={14} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={false}
        collisionPadding={8}
        className="isolate z-[60]"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative flex max-h-[min(var(--available-height),24rem)] w-[max(var(--anchor-width),12rem)] max-w-[calc(100vw-1rem)] origin-(--transform-origin) flex-col overflow-hidden rounded-xl border border-border bg-popover p-1 font-sans text-[13px] text-popover-foreground shadow-xl shadow-black/30 outline-none transition-[opacity,transform] duration-150 data-ending-style:translate-y-1 data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:opacity-0 motion-reduce:transition-none",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List
            data-slot="select-list"
            className="min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 w-full cursor-default items-center gap-3 rounded-lg py-2 pr-8 pl-3 text-left leading-5 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium max-[760px]:min-h-11 max-[760px]:text-base",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 break-words">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center text-foreground">
        <Check size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
