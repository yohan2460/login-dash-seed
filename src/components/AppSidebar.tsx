import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  Building2,
  LogOut,
  Package,
  CreditCard,
  TrendingUp,
  CheckCircle,
  Users,
  Hash,
  Minus,
  CalendarClock,
  Wallet,
  ChevronDown,
  Clock,
  Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface FacturasStats {
  total: number;
  sinClasificar: number;
  mercancia: number;
  gastos: number;
  pendientes: number;
  pagadas: number;
  gastosPendientes: number;
  gastosPagados: number;
  proveedores: number;
  sistematizadas: number;
  notasCredito: number;
}

type NavLinkItem = {
  type: "link";
  title: string;
  description?: string;
  url: string;
  icon: LucideIcon;
  count?: number;
};

type NavGroupItem = {
  type: "group";
  title: string;
  description?: string;
  icon: LucideIcon;
  items: NavLinkItem[];
};

type NavItem = NavLinkItem | NavGroupItem;

type NavSection = {
  title: string;
  items: NavItem[];
};

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const currentPath = location.pathname;
  const [stats, setStats] = useState<FacturasStats>({
    total: 0,
    sinClasificar: 0,
    mercancia: 0,
    gastos: 0,
    pendientes: 0,
    pagadas: 0,
    gastosPendientes: 0,
    gastosPagados: 0,
    proveedores: 0,
    sistematizadas: 0,
    notasCredito: 0
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
      const sistematizadas = facturas?.filter(f => f.clasificacion === 'sistematizada').length || 0;
      const notasCredito = facturas?.filter(f => f.clasificacion === 'nota_credito').length || 0;
      const pendientes = facturas?.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia !== 'pagada').length || 0;
      const pagadas = facturas?.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada').length || 0;
      const gastosPendientes = facturas?.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia !== 'pagada').length || 0;
      const gastosPagados = facturas?.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia === 'pagada').length || 0;

      // Calcular proveedores únicos
      const proveedoresUnicos = new Set(facturas?.map(f => f.emisor_nit)).size;

      setStats({
        total: facturas?.length || 0,
        sinClasificar,
        mercancia,
        gastos,
        pendientes,
        pagadas,
        gastosPendientes,
        gastosPagados,
        proveedores: proveedoresUnicos,
        sistematizadas,
        notasCredito
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const navSections: NavSection[] = [
    {
      title: "Trabajo diario",
      items: [
        {
          type: "link",
          title: "Sin clasificar",
          description: "Entrada principal para validar facturas",
          url: "/sin-clasificar",
          icon: FileText,
          count: stats.sinClasificar
        },
        {
          type: "link",
          title: "Pagos próximos",
          description: "Vencimientos y alertas de pago",
          url: "/pagos-proximos",
          icon: CalendarClock
        }
      ]
    },
    {
      title: "Estados de facturas",
      items: [
        {
          type: "group",
          title: "Mercancía",
          description: "Compras y proveedores de inventario",
          icon: Package,
          items: [
            {
              type: "link",
              title: "Pendientes",
              description: "Esperando pago o gestión",
              url: "/mercancia-pendiente",
              icon: Clock,
              count: stats.pendientes
            },
            {
              type: "link",
              title: "Pagadas",
              description: "Pagos confirmados",
              url: "/mercancia-pagada",
              icon: CheckCircle,
              count: stats.pagadas
            }
          ]
        },
        {
          type: "group",
          title: "Gastos",
          description: "Servicios y operaciones internas",
          icon: CreditCard,
          items: [
            {
              type: "link",
              title: "Pendientes",
              description: "Por pagar",
              url: "/gastos-pendientes",
              icon: Clock,
              count: stats.gastosPendientes
            },
            {
              type: "link",
              title: "Pagados",
              description: "Pagos registrados",
              url: "/gastos-pagados",
              icon: CheckCircle,
              count: stats.gastosPagados
            }
          ]
        },
        {
          type: "link",
          title: "Sistematizadas",
          description: "Integradas al sistema contable",
          url: "/sistematizadas",
          icon: Layers,
          count: stats.sistematizadas
        },
        {
          type: "link",
          title: "Notas de crédito",
          description: "Ajustes y reversos",
          url: "/notas-credito",
          icon: Minus,
          count: stats.notasCredito
        }
      ]
    },
    {
      title: "Reportes y administración",
      items: [
        {
          type: "link",
          title: "Informes",
          description: "Análisis y tableros",
          url: "/informes",
          icon: TrendingUp
        },
        {
          type: "link",
          title: "Por proveedor",
          description: "Comparativa por empresa",
          url: "/facturas-por-proveedor",
          icon: Building2
        },
        {
          type: "link",
          title: "Por serie",
          description: "Visión por número de serie",
          url: "/facturas-por-serie",
          icon: Hash
        },
        {
          type: "link",
          title: "Saldos a favor",
          description: "Aplicaciones pendientes",
          url: "/saldos-favor",
          icon: Wallet
        },
        {
          type: "link",
          title: "Usuarios",
          description: "Gestión del equipo",
          url: "/usuarios",
          icon: Users
        }
      ]
    }
  ];

  const isActive = (path: string) => currentPath === path;

  const getNavCls = (active: boolean) =>
    active
      ? "bg-primary/10 text-primary font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/50";

  const handleSignOut = async () => {
    await signOut();
  };

  const isCollapsed = state === "collapsed";

  const renderNavLink = (item: NavLinkItem, options?: { isChild?: boolean }) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton
        asChild
        className={cn(
          "w-full rounded-lg",
          isCollapsed ? "h-10" : "h-auto"
        )}
      >
        <NavLink
          to={item.url}
          className={({ isActive: active }) =>
            cn(
              "flex items-center transition-all duration-200",
              isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
              options?.isChild && !isCollapsed ? "pl-8" : "",
              getNavCls(active)
            )
          }
          title={isCollapsed ? item.title : undefined}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && (
            <div className="flex-1 flex items-center gap-3">
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{item.title}</div>
                {item.description && (
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                )}
              </div>
              {item.count !== undefined && item.count > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {item.count}
                </Badge>
              )}
            </div>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const renderGroup = (group: NavGroupItem) => {
    const groupActive = group.items.some(child => isActive(child.url));
    const groupCount = group.items.reduce((sum, child) => sum + (child.count ?? 0), 0);
    const isOpen = groupActive || openGroups[group.title] || false;

    return (
      <SidebarMenuItem key={group.title} className="p-0">
        <Collapsible
          open={isOpen}
          onOpenChange={(open) =>
            setOpenGroups(prev => ({ ...prev, [group.title]: open }))
          }
        >
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={cn(
                "w-full px-3 py-2 rounded-lg transition-all",
                getNavCls(groupActive)
              )}
            >
              <div className="flex w-full items-center gap-3">
                <group.icon className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{group.title}</div>
                  {group.description && (
                    <div className="text-xs text-muted-foreground">
                      {group.description}
                    </div>
                  )}
                </div>
                {groupCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {groupCount}
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    isOpen ? "rotate-180" : ""
                  )}
                />
              </div>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1 border-l border-border/40 pl-3 ml-4">
            <SidebarMenu className="space-y-1">
              {group.items.map(child => renderNavLink(child, { isChild: true }))}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  };

  const renderCollapsedGroup = (group: NavGroupItem) => {
    const groupActive = group.items.some(child => isActive(child.url));

    return (
      <SidebarMenuItem key={group.title}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className={cn(
                "h-10 w-full justify-center rounded-lg",
                getNavCls(groupActive)
              )}
              title={group.title}
            >
              <group.icon className="w-4 h-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-[220px]">
            <div className="px-2 pb-1 pt-2">
              <p className="text-sm font-semibold">{group.title}</p>
              {group.description && (
                <p className="text-xs text-muted-foreground">{group.description}</p>
              )}
            </div>
            {group.items.map(child => (
              <DropdownMenuItem
                key={child.url}
                onSelect={() => navigate(child.url)}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2">
                  <child.icon className="h-4 w-4" />
                  {child.title}
                </span>
                {child.count !== undefined && child.count > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {child.count}
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      className={`border-r bg-card/50 backdrop-blur-sm transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      <SidebarHeader className="border-b p-4">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Sistema de Gestión
              </h2>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={`py-6 ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {navSections.map((section, index) => (
          <SidebarGroup
            key={section.title}
            className={index > 0 ? "mt-6" : undefined}
          >
            {!isCollapsed && (
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                {section.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {section.items.map((item) =>
                  "items" in item
                    ? isCollapsed
                      ? renderCollapsedGroup(item)
                      : renderGroup(item)
                    : renderNavLink(item)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {!isCollapsed && (
          <SidebarGroup className="mt-8">
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
              Indicadores rápidos
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-3">
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Total de facturas
                    </div>
                    <span className="text-sm font-semibold">{stats.total}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Proveedores activos
                    </div>
                    <span className="text-sm font-semibold">{stats.proveedores}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4" />
                      Pagos completados
                    </div>
                    <span className="text-sm font-semibold">
                      {stats.pagadas + stats.gastosPagados}
                    </span>
                  </div>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-3">
            <Avatar className="w-10 h-10" title={user?.email}>
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="w-10 h-10 text-muted-foreground hover:text-foreground"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-muted-foreground">Administrador</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full justify-start mt-3 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
