import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ModernStatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color: "blue" | "green" | "purple" | "orange" | "red";
  className?: string;
}

const colorVariants = {
  blue: {
    bg: "bg-blue-50",
    border: "border-l-blue-500",
    icon: "text-blue-600",
    iconBg: "bg-blue-100",
    text: "text-blue-600",
  },
  green: {
    bg: "bg-green-50", 
    border: "border-l-green-500",
    icon: "text-green-600",
    iconBg: "bg-green-100",
    text: "text-green-600",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-l-purple-500", 
    icon: "text-purple-600",
    iconBg: "bg-purple-100",
    text: "text-purple-600",
  },
  orange: {
    bg: "bg-orange-50",
    border: "border-l-orange-500",
    icon: "text-orange-600", 
    iconBg: "bg-orange-100",
    text: "text-orange-600",
  },
  red: {
    bg: "bg-red-50",
    border: "border-l-red-500",
    icon: "text-red-600",
    iconBg: "bg-red-100", 
    text: "text-red-600",
  },
};

export function ModernStatsCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color, 
  className 
}: ModernStatsCardProps) {
  const variants = colorVariants[color];

  return (
    <Card className={cn(
      "border-l-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]",
      variants.border,
      variants.bg,
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("text-2xl font-bold", variants.text)}>
              {value}
            </p>
            {trend && (
              <div className="flex items-center space-x-1">
                <span className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-green-600" : "text-red-600"
                )}>
                  {trend.isPositive ? "+" : ""}{trend.value}
                </span>
                <span className="text-xs text-muted-foreground">vs mes anterior</span>
              </div>
            )}
          </div>
          <div className={cn(
            "p-3 rounded-xl",
            variants.iconBg
          )}>
            <Icon className={cn("w-6 h-6", variants.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}