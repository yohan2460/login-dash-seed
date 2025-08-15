import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";

interface ModernLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function ModernLayout({ children, title, subtitle, actions }: ModernLayoutProps) {
  const { theme, setTheme } = useTheme();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Modern Header */}
          <header className="h-16 border-b bg-card/95 backdrop-blur-sm flex items-center justify-between px-6 shadow-sm">
            <div className="flex items-center space-x-4">
              <SidebarTrigger className="hover:bg-muted transition-colors" />
              <div className="hidden md:flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input 
                    placeholder="Buscar facturas..." 
                    className="pl-10 w-64 bg-muted/30 border-border/50 focus:bg-card focus:border-border transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="hover:bg-muted transition-colors"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-muted transition-colors">
                <Bell className="w-4 h-4" />
              </Button>
            </div>
          </header>

          {/* Page Header */}
          {(title || subtitle || actions) && (
            <div className="bg-muted/30 border-b px-6 py-8">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div>
                  {title && (
                    <h1 className="text-3xl font-semibold text-foreground">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center space-x-3">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className="flex-1 p-6 bg-muted/10">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}