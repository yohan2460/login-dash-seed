import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ModernStatsCardProps {
  title: string;
  value: string;
  icon?: LucideIcon; // Opcional ahora
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color: "blue" | "green" | "purple" | "orange" | "red";
  className?: string;
  description?: string;
}

const colorVariants = {
  blue: {
    bg: "bg-gradient-to-br from-blue-50 to-blue-100/50",
    border: "border-l-blue-500",
    text: "text-blue-900",
    shadow: "shadow-blue-100",
  },
  green: {
    bg: "bg-gradient-to-br from-green-50 to-green-100/50",
    border: "border-l-green-500",
    text: "text-green-900",
    shadow: "shadow-green-100",
  },
  purple: {
    bg: "bg-gradient-to-br from-purple-50 to-purple-100/50",
    border: "border-l-purple-500",
    text: "text-purple-900",
    shadow: "shadow-purple-100",
  },
  orange: {
    bg: "bg-gradient-to-br from-orange-50 to-orange-100/50",
    border: "border-l-orange-500",
    text: "text-orange-900",
    shadow: "shadow-orange-100",
  },
  red: {
    bg: "bg-gradient-to-br from-red-50 to-red-100/50",
    border: "border-l-red-500",
    text: "text-red-900",
    shadow: "shadow-red-100",
  },
};

export function ModernStatsCard({
  title,
  value,
  icon: Icon, // Sigue siendo opcional
  trend,
  color,
  className,
  description
}: ModernStatsCardProps) {
  const variants = colorVariants[color];

  const CardComponent = (
    <Card className={cn(
      "border-l-2 transition-all duration-200 hover:shadow-md hover:scale-[1.01] border-0 shadow-sm cursor-pointer",
      variants.border,
      variants.bg,
      variants.shadow,
      className
    )}>
      <CardContent className="p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">{title}</p>
          <div className="space-y-1">
            <p className={cn("text-xl font-bold leading-tight", variants.text)}>
              {value}
            </p>
            {trend && (
              <div className="flex items-center space-x-1">
                <div className={cn(
                  "flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                  trend.isPositive
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}>
                  <span className="text-xs">{trend.isPositive ? "↗" : "↘"}</span>
                  <span className="ml-0.5 text-xs">{trend.isPositive ? "+" : ""}{trend.value}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (description) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {CardComponent}
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return CardComponent;
}