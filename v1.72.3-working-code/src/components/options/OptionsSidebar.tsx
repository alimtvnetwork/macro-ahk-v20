import { useState } from "react";
import marcoLogo from "@/assets/marco-logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  FolderOpen,
  FileCode,
  Stethoscope,
  MessageSquare,
  Info,
  Settings,
  Database,
  Zap,
  MoreHorizontal,
  Timer,
  BarChart3,
  Wifi,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SidebarSection =
  | "projects" | "scripts" | "prompts" | "automation" | "updaters" | "storage" | "api" | "settings" | "about"
  | "logging" | "timing" | "data" | "network";

export interface SidebarSelection {
  type: "section" | "project" | "script";
  section?: SidebarSection;
  projectId?: string;
  scriptId?: string;
}

interface Props {
  selection: SidebarSelection;
  onSelect: (selection: SidebarSelection) => void;
}

/* ------------------------------------------------------------------ */
/*  Nav items                                                          */
/* ------------------------------------------------------------------ */

const primaryItems: Array<{ id: SidebarSection; label: string; icon: typeof FolderOpen }> = [
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "scripts", label: "Scripts", icon: FileCode },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "updaters", label: "Updaters", icon: RefreshCw },
  { id: "storage", label: "Storage", icon: Database },
  { id: "api", label: "API Explorer", icon: Zap },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "about", label: "About", icon: Info },
];

const overflowItems: Array<{ id: SidebarSection; label: string; icon: typeof FolderOpen }> = [
  { id: "logging", label: "Diagnostics", icon: Stethoscope },
  { id: "timing", label: "Timing", icon: Timer },
  { id: "data", label: "Data", icon: BarChart3 },
  { id: "network", label: "Network", icon: Wifi },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OptionsSidebar({ selection, onSelect }: Props) {
  const { state } = useSidebar();
  const isExpanded = state !== "collapsed";
  const [overflowOpen, setOverflowOpen] = useState(false);

  const isOverflowActive = overflowItems.some(
    (item) => selection.type === "section" && selection.section === item.id,
  );
  const activeOverflowLabel = overflowItems.find(
    (item) => selection.type === "section" && selection.section === item.id,
  )?.label;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo / branding */}
        {isExpanded && (
          <div className="px-4 pt-4 pb-2 flex items-center gap-2 anim-fade-in-left">
            <div className="relative h-9 w-9 rounded-md overflow-hidden transition-transform duration-200 hover:scale-110 hover:rotate-[5deg]">
              <img src={marcoLogo} alt="Marco logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-bold tracking-tight">MARCO</span>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item, index) => (
                <NavItem
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={selection.type === "section" && selection.section === item.id}
                  isExpanded={isExpanded}
                  onSelect={() => onSelect({ type: "section", section: item.id })}
                />
              ))}

              {/* Overflow "..." menu for secondary tools */}
              <SidebarMenuItem>
                <div className={`anim-fade-in-left hover-shift-right anim-delay-${primaryItems.length + 1}`}>
                  <DropdownMenu open={overflowOpen} onOpenChange={setOverflowOpen}>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        className={`
                          transition-all duration-200
                          hover:bg-primary/10 hover:text-primary
                          active:scale-[0.97]
                          ${isOverflowActive ? "bg-primary/15 text-primary font-medium" : ""}
                        `}
                      >
                        <div className={`transition-transform duration-200 ${isOverflowActive ? "scale-[1.15]" : ""}`}>
                          <MoreHorizontal
                            className={`h-4 w-4 mr-2 transition-colors ${
                              isOverflowActive ? "text-primary" : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        {isExpanded && (
                          <span>{isOverflowActive ? activeOverflowLabel : "More"}</span>
                        )}
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[160px]">
                      {overflowItems.map((item) => {
                        const isActive = selection.type === "section" && selection.section === item.id;
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            onClick={() => {
                              onSelect({ type: "section", section: item.id });
                              setOverflowOpen(false);
                            }}
                            className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                          >
                            <item.icon className="h-4 w-4 mr-2" />
                            {item.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav Item                                                           */
/* ------------------------------------------------------------------ */

interface NavItemProps {
  item: (typeof primaryItems)[number];
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: () => void;
}

/** CSS-animated sidebar navigation item. */
function NavItem({ item, index, isActive, isExpanded, onSelect }: NavItemProps) {
  const delayClass = index <= 6 ? `anim-delay-${index + 1}` : "";

  return (
    <SidebarMenuItem>
      <div className={`anim-fade-in-left hover-shift-right ${delayClass}`}>
        <SidebarMenuButton
          onClick={onSelect}
          className={`
            transition-all duration-200 
            hover:bg-primary/10 hover:text-primary
            active:scale-[0.97]
            ${isActive ? "bg-primary/15 text-primary font-medium" : ""}
          `}
        >
          <div className={`transition-transform duration-200 ${isActive ? "scale-[1.15]" : ""}`}>
            <item.icon
              className={`h-4 w-4 mr-2 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>
          {isExpanded && <span>{item.label}</span>}
        </SidebarMenuButton>
      </div>
    </SidebarMenuItem>
  );
}
