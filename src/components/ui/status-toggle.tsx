import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface StatusToggleProps {
  isActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export const StatusToggle = ({
  isActive,
  onToggle,
  disabled = false,
  size = "md",
  showLabel = true,
}: StatusToggleProps) => {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isActive}
        onCheckedChange={onToggle}
        disabled={disabled}
        className={cn(
          size === "sm" && "scale-75",
          isActive ? "data-[state=checked]:bg-success" : "data-[state=unchecked]:bg-muted"
        )}
      />
      {showLabel && (
        <span
          className={cn(
            "text-xs font-medium",
            isActive ? "text-success" : "text-muted-foreground"
          )}
        >
          {isActive ? "Actif" : "Inactif"}
        </span>
      )}
    </div>
  );
};
