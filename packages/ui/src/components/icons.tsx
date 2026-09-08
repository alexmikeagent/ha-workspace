import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  BubbleChatIcon,
  Building03Icon,
  Cancel01Icon,
  Download04Icon,
  DriveIcon,
  File02Icon,
  FileQuestionMarkIcon,
  Folder01Icon,
  GitBranchIcon,
  Image02Icon,
  Invoice02Icon,
  Layers01Icon,
  Menu01Icon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PanelRightIcon,
  Refresh01Icon,
  Search01Icon,
  SearchAddIcon,
  SearchMinusIcon,
  SecurityCheckIcon,
  SentIcon,
  SparklesIcon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import {
  forwardRef,
  type ComponentProps,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react"

export type IconProps = Omit<
  ComponentProps<typeof HugeiconsIcon>,
  "icon" | "altIcon" | "showAlt" | "ref" | "children"
>
export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

// Keep one renderer and one stroke style throughout the workspace. Buttons and
// links own accessible action names; a directly labelled icon can opt into img semantics.
function createIcon(name: string, shape: IconSvgElement): IconComponent {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function WorkspaceIcon(
    {
      size = 16,
      strokeWidth = 1.5,
      color = "currentColor",
      "aria-label": label,
      "aria-labelledby": labelledBy,
      "aria-hidden": hidden,
      role,
      ...props
    },
    ref,
  ) {
    const labelled = Boolean(label || labelledBy)
    return (
      <HugeiconsIcon
        {...props}
        ref={ref}
        icon={shape}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
        focusable="false"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-hidden={hidden ?? !labelled}
        role={role ?? (labelled ? "img" : undefined)}
        data-workspace-icon={name}
      />
    )
  })
  Icon.displayName = name
  return Icon
}

export const ArrowLeft = createIcon("ArrowLeft", ArrowLeft02Icon)
export const ArrowRight = createIcon("ArrowRight", ArrowRight02Icon)
export const Building2 = createIcon("Company", Building03Icon)
export const Check = createIcon("Check", Tick02Icon)
export const ChevronLeft = createIcon("ChevronLeft", ArrowLeft01Icon)
export const ChevronRight = createIcon("ChevronRight", ArrowRight01Icon)
export const ChevronDown = createIcon("ChevronDown", ArrowDown01Icon)
export const ChevronUp = createIcon("ChevronUp", ArrowUp01Icon)
export const ChevronsUpDown = createIcon("Select", UnfoldMoreIcon)
export const Download = createIcon("Download", Download04Icon)
export const FileQuestion = createIcon("FileQuestion", FileQuestionMarkIcon)
export const FileText = createIcon("Document", File02Icon)
export const FolderClosed = createIcon("Folder", Folder01Icon)
export const GitBranch = createIcon("Revision", GitBranchIcon)
export const HardDrive = createIcon("LocalDrive", DriveIcon)
export const Image = createIcon("Image", Image02Icon)
export const Layers2 = createIcon("Templates", Layers01Icon)
export const Menu = createIcon("Menu", Menu01Icon)
export const MessageSquare = createIcon("Comment", BubbleChatIcon)
export const PanelLeft = createIcon("Sidebar", PanelLeftIcon)
export const PanelLeftClose = createIcon("CloseSidebar", PanelLeftCloseIcon)
export const PanelRight = createIcon("Inspector", PanelRightIcon)
export const ReceiptText = createIcon("Invoice", Invoice02Icon)
export const RefreshCw = createIcon("Refresh", Refresh01Icon)
export const Search = createIcon("Search", Search01Icon)
export const Send = createIcon("Send", SentIcon)
export const ShieldCheck = createIcon("Verified", SecurityCheckIcon)
export const Sparkles = createIcon("Assistant", SparklesIcon)
export const XIcon = createIcon("Close", Cancel01Icon)
export const X = XIcon
export const ZoomIn = createIcon("ZoomIn", SearchAddIcon)
export const ZoomOut = createIcon("ZoomOut", SearchMinusIcon)
