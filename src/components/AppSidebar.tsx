import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  FileText, 
  Building2, 
  LogOut,
  Package,
  CreditCard,
  TrendingUp,
  Users,
  CheckCircle
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";

const navigationItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Por Proveedor",
    url: "/facturas-por-proveedor", 
    icon: Building2,
  },
];

interface FacturasStats {
  total: number;
  sinClasificar: number;
  mercancia: number;
  gastos: number;
  pendientes: number;
  pagadas: number;
  proveedores: number;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentPath = location.pathname;
  const { activeCategory, setActiveCategory } = useDashboard();
  const [stats, setStats] = useState<FacturasStats>({
    total: 0,
    sinClasificar: 0,
    mercancia: 0,
    gastos: 0,
    pendientes: 0,
    pagadas: 0,
    proveedores: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data: facturas, error } = await supabase
        .from('facturas')
        .select('*');
      
      if (error) throw error;

      const sinClasificar = facturas?.filter(f => f.clasificacion === null).length || 0;
      const mercancia = facturas?.filter(f => f.clasificacion === 'mercancia').length || 0;
      const gastos = facturas?.filter(f => f.clasificacion === 'gasto').length || 0;
      const pendientes = facturas?.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia !== 'pagada').length || 0;
      const pagadas = facturas?.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada').length || 0;
      
      // Calcular proveedores únicos
      const proveedoresUnicos = new Set(facturas?.map(f => f.emisor_nit)).size;

      setStats({
        total: facturas?.length || 0,
        sinClasificar,
        mercancia,
        gastos,
        pendientes,
        pagadas,
        proveedores: proveedoresUnicos
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const isActive = (path: string) => currentPath === path;

  const getNavCls = (isActive: boolean) =>
    isActive 
      ? "bg-primary/10 text-primary border-r-2 border-primary font-medium" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar className={`${state === 'collapsed' ? "w-16" : "w-72"} border-r bg-card/50 backdrop-blur-sm`}>
      <SidebarHeader className="border-b p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          {state !== 'collapsed' && (
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Sistema de Gestión
              </h2>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 py-6">
        {/* NAVEGACIÓN */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-4">
            {state !== 'collapsed' ? "NAVEGACIÓN" : ""}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-12">
                    <NavLink 
                      to={item.url} 
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${getNavCls(isActive(item.url))}`}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {state !== 'collapsed' && (
                        <span className="font-medium">{item.title}</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* RESUMEN RÁPIDO */}
        {state !== 'collapsed' && (
          <SidebarGroup className="mt-8">
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-4">
              RESUMEN RÁPIDO
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-600 font-medium">Facturas</span>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">{stats.total}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">Proveedores</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">{stats.proveedores}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded-lg bg-purple-50 dark:bg-purple-950/20">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-purple-600 font-medium">Pagadas</span>
                  </div>
                  <span className="text-sm font-semibold text-purple-700">{stats.pagadas}</span>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* CATEGORÍAS */}
        {state !== 'collapsed' && currentPath === '/dashboard' && (
          <SidebarGroup className="mt-8">
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-4">
              Categorías
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-1">
                <div 
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCategory === 'overview' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCategory('overview')}
                >
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Resumen General</div>
                      <div className="text-xs text-muted-foreground">{stats.total} facturas</div>
                    </div>
                  </div>
                </div>
                
                <div 
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCategory === 'sin-clasificar' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCategory('sin-clasificar')}
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Sin Clasificar</div>
                      <div className="text-xs text-muted-foreground">{stats.sinClasificar} facturas</div>
                    </div>
                  </div>
                </div>
                
                <div 
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCategory === 'mercancia-pendientes' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCategory('mercancia-pendientes')}
                >
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Mercancía - Pendientes</div>
                      <div className="text-xs text-muted-foreground">{stats.pendientes} facturas</div>
                    </div>
                  </div>
                </div>
                
                <div 
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCategory === 'mercancia-pagadas' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCategory('mercancia-pagadas')}
                >
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Mercancía - Pagadas</div>
                      <div className="text-xs text-muted-foreground">{stats.pagadas} facturas</div>
                    </div>
                  </div>
                </div>
                
                <div 
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCategory === 'gastos' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveCategory('gastos')}
                >
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Gastos</div>
                      <div className="text-xs text-muted-foreground">{stats.gastos} facturas</div>
                    </div>
                  </div>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {state !== 'collapsed' && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
          )}
        </div>
        {state !== 'collapsed' && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleSignOut}
            className="w-full justify-start mt-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}