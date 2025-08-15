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
    bg: "bg-slate-50",
    border: "border-l-slate-300",
    icon: "text-slate-600",
    iconBg: "bg-slate-100",
    text: "text-slate-700",
  },
  green: {
    bg: "bg-slate-50", 
    border: "border-l-slate-400",
    icon: "text-slate-600",
    iconBg: "bg-slate-100",
    text: "text-slate-700",
  },
  purple: {
    bg: "bg-neutral-50",
    border: "border-l-neutral-300", 
    icon: "text-neutral-600",
    iconBg: "bg-neutral-100",
    text: "text-neutral-700",
  },
  orange: {
    bg: "bg-neutral-50",
    border: "border-l-neutral-400",
    icon: "text-neutral-600", 
    iconBg: "bg-neutral-100",
    text: "text-neutral-700",
  },
  red: {
    bg: "bg-slate-50",
    border: "border-l-slate-300",
    icon: "text-slate-600",
    iconBg: "bg-slate-100", 
    text: "text-slate-700",
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