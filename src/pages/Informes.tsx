import { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ModernLayout } from '@/components/ModernLayout';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import * as XLSX from 'xlsx';
import { calcularMontoRetencionReal, calcularValorRealAPagar } from '@/utils/calcularValorReal';
import {
  Filter,
  Download,
  Building2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Receipt,
  CreditCard,
  Calendar,
  Search,
  RefreshCw,
  ArrowUpDown,
  Eye,
  X,
  Edit2,
  Check,
  Paperclip
} from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  numero_serie: string | null;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion: string | null;
  clasificacion_original: string | null;
  estado_mercancia: string | null;
  metodo_pago: string | null;
  factura_iva: number | null;
  monto_pagado: number | null;
  valor_real_a_pagar: number | null;
  uso_pronto_pago: boolean | null;
  porcentaje_pronto_pago: number | null;
  tiene_retencion: boolean | null;
  monto_retencion: number | null;
  total_sin_iva: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  created_at: string;
  ingresado_sistema: boolean | null;
  pdf_file_path: string | null;
  descuentos_antes_iva: string | null;
}

interface PagoPartido {
  id: string;
  factura_id: string;
  metodo_pago: string;
  monto: number;
  fecha_pago: string;
}

interface FilterState {
  fechaInicio: string;
  fechaFin: string;
  fechaPagoInicio: string;
  fechaPagoFin: string;
  tipoFecha: 'emision' | 'pago'; // Nuevo: tipo de fecha a filtrar
  proveedor: string;
  clasificacion: string;
  estadoPago: string;
  metodoPago: string;
  montoMinimo: string;
  montoMaximo: string;
  ingresoSistema: string;
}

export default function Informes() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [filteredFacturas, setFilteredFacturas] = useState<Factura[]>([]);
  const [selectedFacturas, setSelectedFacturas] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [editingSerieId, setEditingSerieId] = useState<string | null>(null);
  const [editingSerieValue, setEditingSerieValue] = useState<string>('');
  // Obtener el primer y último día del mes actual
  const getCurrentMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      inicio: firstDay.toISOString().split('T')[0],
      fin: lastDay.toISOString().split('T')[0]
    };
  };

  const monthRange = getCurrentMonthRange();

  const [filters, setFilters] = useState<FilterState>({
    fechaInicio: monthRange.inicio,
    fechaFin: monthRange.fin,
    fechaPagoInicio: '',
    fechaPagoFin: '',
    tipoFecha: 'emision',
    proveedor: '',
    clasificacion: '',
    estadoPago: '',
    metodoPago: '',
    montoMinimo: '',
    montoMaximo: '',
    ingresoSistema: ''
  });

  const { data: queryData, isLoading: loadingData, refetch } = useSupabaseQuery(
    ['facturas', 'informes'],
    async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select(`
          *,
          ingresado_sistema
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: pagosData, error: pagosError } = await supabase
        .from('pagos_partidos')
        .select('*');

      if (pagosError) throw pagosError;

      return {
        facturas: data ?? [],
        pagosPartidos: pagosData ?? []
      };
    },
    {
      enabled: !!user
    }
  );

  const facturas = queryData?.facturas ?? [];
  const pagosPartidos = queryData?.pagosPartidos ?? [];

  // Escuchar cambios en tiempo real de la base de datos
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('facturas-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'facturas'
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  // Refrescar datos cada 5 minutos para asegurar sincronización (solo si es necesario)
  // useEffect(() => {
  //   if (user) {
  //     const interval = setInterval(() => {
  //       fetchFacturas();
  //     }, 300000); // 5 minutos en lugar de 30 segundos
  //
  //     return () => clearInterval(interval);
  //   }
  // }, [user]);

  useEffect(() => {
    applyFilters();
  }, [facturas, filters, searchTerm, sortOrder]);

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const applyFilters = () => {
    let filtered = [...facturas];

    // Filtro por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(f =>
        f.emisor_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.numero_factura.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.emisor_nit.includes(searchTerm)
      );
    }

    // Filtro por fechas de emisión (solo si tipo de fecha es 'emision')
    if (filters.tipoFecha === 'emision') {
      if (filters.fechaInicio) {
        filtered = filtered.filter(f => {
          const fechaFactura = f.fecha_emision || f.created_at;
          if (!fechaFactura) return false;

          // Extraer solo la fecha (YYYY-MM-DD) para comparación
          const fechaStr = fechaFactura.split('T')[0];
          return fechaStr >= filters.fechaInicio;
        });
      }

      if (filters.fechaFin) {
        filtered = filtered.filter(f => {
          const fechaFactura = f.fecha_emision || f.created_at;
          if (!fechaFactura) return false;

          // Extraer solo la fecha (YYYY-MM-DD) para comparación
          const fechaStr = fechaFactura.split('T')[0];
          return fechaStr <= filters.fechaFin;
        });
      }
    }

    // Filtro por fechas de pago (solo si tipo de fecha es 'pago')
    if (filters.tipoFecha === 'pago') {
      if (filters.fechaPagoInicio) {
        filtered = filtered.filter(f => {
          if (!f.fecha_pago) return false;

          // Extraer solo la fecha (YYYY-MM-DD) para comparación
          const fechaStr = f.fecha_pago.split('T')[0];
          return fechaStr >= filters.fechaPagoInicio;
        });
      }

      if (filters.fechaPagoFin) {
        filtered = filtered.filter(f => {
          if (!f.fecha_pago) return false;

          // Extraer solo la fecha (YYYY-MM-DD) para comparación
          const fechaStr = f.fecha_pago.split('T')[0];
          return fechaStr <= filters.fechaPagoFin;
        });
      }
    }

    // Filtro por proveedor
    if (filters.proveedor) {
      filtered = filtered.filter(f => f.emisor_nit === filters.proveedor);
    }

    // Filtro por clasificación (Tipo)
    if (filters.clasificacion) {
      if (filters.clasificacion === 'sistematizada') {
        filtered = filtered.filter(f => f.clasificacion === 'sistematizada');
      } else if (filters.clasificacion === 'Mercancía') {
        filtered = filtered.filter(f =>
          f.clasificacion_original === 'Mercancía' ||
          f.clasificacion?.toLowerCase() === 'mercancia'
        );
      } else if (filters.clasificacion === 'Gastos') {
        filtered = filtered.filter(f =>
          f.clasificacion_original === 'Gastos' ||
          f.clasificacion?.toLowerCase() === 'gasto' ||
          f.clasificacion?.toLowerCase() === 'gastos'
        );
      } else {
        filtered = filtered.filter(f => f.clasificacion_original === filters.clasificacion);
      }
    }

    // Filtro por estado de pago
    if (filters.estadoPago) {
      filtered = filtered.filter(f => f.estado_mercancia === filters.estadoPago);
    }

    // Filtro por método de pago
    if (filters.metodoPago) {
      filtered = filtered.filter(f => f.metodo_pago === filters.metodoPago);
    }

    // Filtro por montos
    if (filters.montoMinimo) {
      const minimo = parseFloat(filters.montoMinimo);
      filtered = filtered.filter(f => f.total_a_pagar >= minimo);
    }

    if (filters.montoMaximo) {
      const maximo = parseFloat(filters.montoMaximo);
      filtered = filtered.filter(f => f.total_a_pagar <= maximo);
    }

    // Filtro por ingreso al sistema
    if (filters.ingresoSistema) {
      if (filters.ingresoSistema === 'ingresado') {
        filtered = filtered.filter(f => f.ingresado_sistema === true);
      } else if (filters.ingresoSistema === 'pendiente') {
        filtered = filtered.filter(f => f.ingresado_sistema === false || f.ingresado_sistema === null);
      }
    }

    // Ordenar por fecha de emisión
    filtered.sort((a, b) => {
      const fechaA = a.fecha_emision || a.created_at;
      const fechaB = b.fecha_emision || b.created_at;
      const dateA = new Date(fechaA).getTime();
      const dateB = new Date(fechaB).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    setFilteredFacturas(filtered);
  };

  const clearFilters = () => {
    setFilters({
      fechaInicio: '',
      fechaFin: '',
      fechaPagoInicio: '',
      fechaPagoFin: '',
      tipoFecha: 'emision',
      proveedor: '',
      clasificacion: '',
      estadoPago: '',
      metodoPago: '',
      montoMinimo: '',
      montoMaximo: '',
      ingresoSistema: ''
    });
    setSearchTerm('');
  };

  const toggleSelection = (facturaId: string) => {
    setSelectedFacturas(prev =>
      prev.includes(facturaId)
        ? prev.filter(id => id !== facturaId)
        : [...prev, facturaId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedFacturas(
      selectedFacturas.length === filteredFacturas.length
        ? []
        : filteredFacturas.map(f => f.id)
    );
  };

  const exportToExcel = () => {
    if (selectedFacturas.length === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos una factura para exportar",
        variant: "destructive",
      });
      return;
    }

    const facturasToExport = filteredFacturas.filter(f => selectedFacturas.includes(f.id));

    const dataForExcel = facturasToExport.map(factura => {
      // Preparar información del método de pago
      let metodoPagoTexto = factura.metodo_pago || 'No especificado';
      let desglosePagos = '';

      if (factura.metodo_pago === 'Pago Partido') {
        const pagosDeFactura = getPagosPartidosPorFactura(factura.id);
        desglosePagos = pagosDeFactura
          .map(pp => `${pp.metodo_pago}: ${formatCurrency(pp.monto)}`)
          .join('; ');
        metodoPagoTexto = `Pago Partido (${desglosePagos})`;
      }

      return {
        'Proveedor': factura.emisor_nombre,
        'NIT': factura.emisor_nit,
        'Serie de Factura': factura.numero_factura,
        'Número de Serie': factura.numero_serie || 'No especificado',
        'Clasificación': factura.clasificacion_original || factura.clasificacion || 'Sin clasificar',
        'Fecha de Emisión': formatFechaSafe(factura.fecha_emision),
        'Fecha de Vencimiento': formatFechaSafe(factura.fecha_vencimiento),
        'Total de la Factura': factura.total_a_pagar,
        'Total Pagado': factura.valor_real_a_pagar || factura.monto_pagado || 0,
        'Estado': factura.estado_mercancia || 'Pendiente',
        'Método de Pago': metodoPagoTexto,
        'Fecha de Pago': factura.fecha_pago ? formatFechaSafe(factura.fecha_pago) : 'No pagada',
        'IVA': factura.factura_iva || 0,
        'Días para Vencer': factura.fecha_vencimiento ?
          Math.ceil((new Date(factura.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) :
          'No especificado'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturas');

    const fileName = `informe_facturas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast({
      title: "Exportación exitosa",
      description: `Se exportaron ${facturasToExport.length} facturas a Excel`,
    });
  };

  const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(toNumber(amount));
  };

  // Función segura para formatear fechas (evita problemas de zona horaria)
  const formatFechaSafe = (fecha: string | null): string => {
    if (!fecha) return 'No especificada';

    try {
      // Extraer solo la parte de la fecha (YYYY-MM-DD) ignorando la hora y zona horaria
      const fechaSoloFecha = fecha.split('T')[0];
      const [year, month, day] = fechaSoloFecha.split('-').map(num => parseInt(num, 10));

      // Crear fecha en zona horaria local (sin conversión UTC)
      const date = new Date(year, month - 1, day);

      // Verificar que la fecha sea válida
      if (isNaN(date.getTime())) {
        console.error('Fecha inválida:', fecha);
        return 'Fecha inválida';
      }

      // Formatear manualmente para evitar problemas de zona horaria
      const dayStr = day.toString().padStart(2, '0');
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString();

      return `${dayStr}/${monthStr}/${yearStr}`;
    } catch (error) {
      console.error('Error al formatear fecha:', fecha, error);
      return 'Error en fecha';
    }
  };

  const getFacturaRoute = (factura: Factura) => {
    // Determinar la ruta según el estado de la factura
    if (factura.clasificacion === 'sistematizada') {
      return `/sistematizadas?highlight=${factura.id}`;
    } else if (!factura.clasificacion || factura.clasificacion === 'sin clasificar') {
      return `/sin-clasificar?highlight=${factura.id}`;
    } else if (factura.clasificacion_original === 'Mercancía' && factura.estado_mercancia === 'pendiente') {
      return `/mercancia-pendiente?highlight=${factura.id}`;
    } else if (factura.clasificacion_original === 'Mercancía' && factura.estado_mercancia === 'pagada') {
      return `/mercancia-pagada?highlight=${factura.id}`;
    } else if (factura.clasificacion_original === 'Gastos' && factura.estado_mercancia === 'pendiente') {
      return `/gastos-pendientes?highlight=${factura.id}`;
    } else if (factura.clasificacion_original === 'Gastos' && factura.estado_mercancia === 'pagada') {
      return `/gastos-pagados?highlight=${factura.id}`;
    }
    // Por defecto, llevar a sin clasificar
    return `/sin-clasificar?highlight=${factura.id}`;
  };

  const getDaysToExpire = (fechaVencimiento: string | null, estadoPago: string | null) => {
    // Si está pagada, no mostrar días de vencimiento
    if (estadoPago === 'pagada') return null;
    
    if (!fechaVencimiento) return null;
    const today = new Date();
    const expireDate = new Date(fechaVencimiento);
    const diffTime = expireDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyBadge = (dias: number | null) => {
    if (dias === null) return null;
    if (dias < 0) return { text: 'VENCIDA', color: 'bg-red-600 text-white' };
    if (dias <= 3) return { text: 'URGENTE', color: 'bg-red-500 text-white' };
    if (dias <= 7) return { text: 'PRÓXIMO', color: 'bg-orange-500 text-white' };
    return null;
  };

  const handleOpenPdf = async (pdfFilePath: string) => {
    setLoadingPdf(true);
    try {
      // Obtener URL pública firmada del archivo
      const { data, error } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(pdfFilePath, 3600); // 1 hora de validez

      if (error) throw error;

      if (data?.signedUrl) {
        setPdfUrl(data.signedUrl);
        setPdfDialogOpen(true);
      }
    } catch (error) {
      console.error('Error al obtener URL del PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar el PDF",
        variant: "destructive",
      });
    } finally {
      setLoadingPdf(false);
    }
  };

  const obtenerComprobantePago = async (facturaId: string) => {
    const { data: comprobantes, error } = await supabase
      .from('comprobantes_pago')
      .select('*')
      .filter('facturas_ids', 'cs', `{${facturaId}}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return comprobantes?.[0] ?? null;
  };

  // Función para descargar comprobante de pago
  const descargarComprobantePago = async (facturaId: string) => {
    try {
      const comprobante = await obtenerComprobantePago(facturaId);

      if (!comprobante) {
        toast({
          title: "Comprobante no encontrado",
          description: "No hay comprobante de pago asociado a esta factura. El comprobante se genera automáticamente al registrar el pago.",
          variant: "destructive"
        });
        return;
      }

      const { data: urlData, error: urlError } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(comprobante.pdf_file_path, 3600);

      if (urlError) throw urlError;

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, '_blank');
        toast({
          title: "Comprobante abierto",
          description: "El comprobante de pago se abrió en una nueva pestaña"
        });
      }
    } catch (error) {
      console.error('Error al descargar comprobante:', error);
      toast({
        title: "Error al descargar",
        description: "Hubo un error al descargar el comprobante",
        variant: "destructive"
      });
    }
  };

  const descargarSoportePago = async (facturaId: string) => {
    try {
      const comprobante = await obtenerComprobantePago(facturaId);

      if (!comprobante || !comprobante.soporte_pago_file_path) {
        toast({
          title: "Soporte no disponible",
          description: "No se encontró un soporte de pago asociado a esta factura.",
          variant: "destructive"
        });
        return;
      }

      const { data: urlData, error: urlError } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(comprobante.soporte_pago_file_path, 3600);

      if (urlError) throw urlError;

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, '_blank');
        toast({
          title: "Soporte abierto",
          description: "El soporte de pago se abrió en una nueva pestaña"
        });
      }
    } catch (error) {
      console.error('Error al descargar soporte:', error);
      toast({
        title: "Error al descargar",
        description: "Hubo un error al descargar el soporte de pago",
        variant: "destructive"
      });
    }
  };

  const handleEditSerie = (facturaId: string, currentSerie: string | null) => {
    setEditingSerieId(facturaId);
    setEditingSerieValue(currentSerie || '');
  };

  const handleSaveSerie = async (facturaId: string) => {
    try {
      const { error } = await supabase
        .from('facturas')
        .update({ numero_serie: editingSerieValue || null })
        .eq('id', facturaId);

      if (error) throw error;

      // Actualizar la factura en el estado local
      setFacturas(prev => prev.map(f =>
        f.id === facturaId ? { ...f, numero_serie: editingSerieValue || null } : f
      ));

      toast({
        title: "Serie actualizada",
        description: "El número de serie se ha actualizado correctamente",
      });

      setEditingSerieId(null);
      setEditingSerieValue('');
    } catch (error) {
      console.error('Error al actualizar serie:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el número de serie",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingSerieId(null);
    setEditingSerieValue('');
  };

  // Helper: Obtener pagos partidos de una factura
  const getPagosPartidosPorFactura = (facturaId: string): PagoPartido[] => {
    return pagosPartidos.filter(pp => pp.factura_id === facturaId);
  };

  // Helper: Calcular monto por método considerando pagos partidos
  const calcularMontoPorMetodo = (facturasPagadas: Factura[], metodoPago: string, usarValorReal: boolean = false) => {
    let total = 0;

    facturasPagadas.forEach(factura => {
      // Buscar pagos de esta factura en pagos_partidos
      const pagosDeEstaFactura = getPagosPartidosPorFactura(factura.id);

      if (pagosDeEstaFactura.length > 0) {
        // Si hay pagos en pagos_partidos, sumar solo los del método específico
        const montoPorMetodo = pagosDeEstaFactura
          .filter(pp => pp.metodo_pago === metodoPago)
          .reduce((sum, pp) => sum + (pp.monto || 0), 0);

        total += montoPorMetodo;
      } else {
        // Fallback: Si no hay pagos en pagos_partidos, usar el método de pago de la factura
        if (factura.metodo_pago === metodoPago) {
          total += (factura.valor_real_a_pagar || factura.monto_pagado || 0);
        }
      }
    });

    return Math.round(total);
  };

  // Calcular estadísticas
  const stats = (() => {
    const facturasPagadas = filteredFacturas.filter(f => f.estado_mercancia === 'pagada');

    console.log('💰 Estadísticas - Facturas pagadas:', facturasPagadas.length);
    console.log('💰 Estadísticas - Total pagos_partidos en estado:', pagosPartidos.length);

    // Métodos de pago - Valor REAL PAGADO (desde pagos_partidos)
    const pagosTobiasReal = calcularMontoPorMetodo(facturasPagadas, 'Pago Tobías');
    const pagosBancosReal = calcularMontoPorMetodo(facturasPagadas, 'Pago Banco');
    const pagosCajaReal = calcularMontoPorMetodo(facturasPagadas, 'Caja');

    console.log('💰 Pagos Tobías:', pagosTobiasReal);
    console.log('💰 Pagos Bancos:', pagosBancosReal);
    console.log('💰 Pagos Caja:', pagosCajaReal);

    // Métodos de pago - Valor OFICIAL (proporción del total_a_pagar)
    const calcularValorOficial = (metodoPago: string): number => {
      let total = 0;

      facturasPagadas.forEach(factura => {
        const pagosDeEstaFactura = getPagosPartidosPorFactura(factura.id);

        if (pagosDeEstaFactura.length > 0) {
          // Si hay pagos en pagos_partidos, calcular proporcionalmente
          const totalPagado = pagosDeEstaFactura.reduce((sum, pp) => sum + pp.monto, 0);

          if (totalPagado > 0) {
            // Calcular proporción que representa este método
            const montoPorMetodo = pagosDeEstaFactura
              .filter(pp => pp.metodo_pago === metodoPago)
              .reduce((sum, pp) => sum + pp.monto, 0);

            const proporcion = montoPorMetodo / totalPagado;
            total += (factura.total_a_pagar * proporcion);
          }
        } else {
          // Fallback: Si no hay pagos en pagos_partidos, usar el método de pago de la factura
          if (factura.metodo_pago === metodoPago) {
            total += factura.total_a_pagar;
          }
        }
      });

      return Math.round(total);
    };

    const pagosTobiasOficial = calcularValorOficial('Pago Tobías');
    const pagosBancosOficial = calcularValorOficial('Pago Banco');
    const pagosCajaOficial = calcularValorOficial('Caja');

    // Desglose de ahorro por método de pago (Pronto Pago, Retención y Descuentos Adicionales)
    const calcularDesglosePorMetodo = (metodoPago: string) => {
      let totalProntoPago = 0;
      let totalRetencion = 0;
      let totalDescuentosAdicionales = 0;

      facturasPagadas.forEach(factura => {
        // Buscar pagos de esta factura en pagos_partidos
        const pagosDeEstaFactura = getPagosPartidosPorFactura(factura.id);

        if (pagosDeEstaFactura.length > 0) {
          // Si hay pagos en pagos_partidos, calcular proporcionalmente
          const montoPorMetodo = pagosDeEstaFactura
            .filter(pp => pp.metodo_pago === metodoPago)
            .reduce((sum, pp) => sum + pp.monto, 0);

          if (montoPorMetodo > 0) {
            // Calcular proporción que representa este método en el VALOR OFICIAL (total_a_pagar)
            const totalPagadoFactura = pagosDeEstaFactura.reduce((sum, pp) => sum + pp.monto, 0);
            const proporcionOficial = totalPagadoFactura > 0 ? montoPorMetodo / totalPagadoFactura : 0;
            const valorOficialMetodo = factura.total_a_pagar * proporcionOficial;

            // Calcular el valor real que debería haber (con descuentos)
            const valorRealCompleto = calcularValorRealAPagar(factura);
            const valorRealMetodo = valorRealCompleto * proporcionOficial;

            // La diferencia es el descuento aplicado a este método
            const descuentoTotalMetodo = valorOficialMetodo - valorRealMetodo;

            // Ahora desglosar ese descuento en sus componentes (proporcional)
            // Pronto pago (proporcional)
            if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
              const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
              totalProntoPago += (baseParaDescuento * (factura.porcentaje_pronto_pago / 100)) * proporcionOficial;
            }

            // Retención (proporcional)
            if (factura.tiene_retencion) {
              totalRetencion += calcularMontoRetencionReal(factura) * proporcionOficial;
            }

            // Descuentos adicionales (proporcional)
            if (factura.descuentos_antes_iva) {
              try {
                const descuentos = JSON.parse(factura.descuentos_antes_iva);
                const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                  if (desc.tipo === 'porcentaje') {
                    const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
                    return sum + (base * desc.valor / 100);
                  }
                  return sum + desc.valor;
                }, 0);
                totalDescuentosAdicionales += totalDescuentos * proporcionOficial;
              } catch (error) {
                console.error('Error parsing descuentos_antes_iva:', error);
              }
            }
          }
        } else {
          // Fallback: Si no hay pagos en pagos_partidos, usar el método de pago de la factura
          if (factura.metodo_pago === metodoPago) {
            // Pronto pago (100% del descuento)
            if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
              const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
              totalProntoPago += baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
            }

            // Retención (100% de la retención)
            if (factura.tiene_retencion) {
              totalRetencion += calcularMontoRetencionReal(factura);
            }

            // Descuentos adicionales (100%)
            if (factura.descuentos_antes_iva) {
              try {
                const descuentos = JSON.parse(factura.descuentos_antes_iva);
                const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                  if (desc.tipo === 'porcentaje') {
                    const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
                    return sum + (base * desc.valor / 100);
                  }
                  return sum + desc.valor;
                }, 0);
                totalDescuentosAdicionales += totalDescuentos;
              } catch (error) {
                console.error('Error parsing descuentos_antes_iva:', error);
              }
            }
          }
        }
      });

      return {
        totalProntoPago: Math.round(totalProntoPago),
        totalRetencion: Math.round(totalRetencion),
        totalDescuentosAdicionales: Math.round(totalDescuentosAdicionales)
      };
    };

    const desgloseTobias = calcularDesglosePorMetodo('Pago Tobías');
    const desgloseBancos = calcularDesglosePorMetodo('Pago Banco');
    const desgloseCaja = calcularDesglosePorMetodo('Caja');

    const totalPagadoOficial = facturasPagadas.reduce((sum, f) => sum + toNumber(f.total_a_pagar), 0);
    const totalPagadoReal = facturasPagadas.reduce((sum, f) => sum + toNumber(f.valor_real_a_pagar || f.monto_pagado), 0);

    // Calcular pronto pago utilizado (facturas pagadas con uso_pronto_pago = true)
    const facturasProntoPagoUtilizado = filteredFacturas.filter(f =>
      f.uso_pronto_pago === true &&
      f.porcentaje_pronto_pago &&
      f.porcentaje_pronto_pago > 0 &&
      f.estado_mercancia === 'pagada'
    );

    const prontoPagoUtilizado = facturasProntoPagoUtilizado.reduce((sum, f) => {
      const baseParaDescuento = f.total_sin_iva || (f.total_a_pagar - (f.factura_iva || 0));
      const descuento = baseParaDescuento * ((f.porcentaje_pronto_pago || 0) / 100);
      return sum + descuento;
    }, 0);

    // Calcular pronto pago NO utilizado (facturas con porcentaje pero sin uso_pronto_pago o pendientes)
    const facturasProntoPagoNoUtilizado = filteredFacturas.filter(f =>
      f.porcentaje_pronto_pago &&
      f.porcentaje_pronto_pago > 0 &&
      (f.uso_pronto_pago !== true || f.estado_mercancia !== 'pagada')
    );

    const prontoPagoNoUtilizado = facturasProntoPagoNoUtilizado.reduce((sum, f) => {
      const baseParaDescuento = f.total_sin_iva || (f.total_a_pagar - (f.factura_iva || 0));
      const descuento = baseParaDescuento * ((f.porcentaje_pronto_pago || 0) / 100);
      return sum + descuento;
    }, 0);

    const facturasPendientes = filteredFacturas.filter(f => f.estado_mercancia !== 'pagada');
    const totalPendiente = facturasPendientes.reduce((sum, f) => sum + toNumber(f.total_a_pagar), 0);


    return {
      totalFacturas: filteredFacturas.length,
      totalMonto: filteredFacturas.reduce((sum, f) => sum + toNumber(f.total_a_pagar), 0),
      totalPagadoOficial,
      totalPagadoReal,
      totalPendiente,
      pagosMercancia: filteredFacturas
        .filter(f => f.clasificacion_original === 'Mercancía' && f.estado_mercancia === 'pagada')
        .reduce((sum, f) => sum + toNumber(f.total_a_pagar), 0),
      pagosGastos: filteredFacturas
        .filter(f => f.clasificacion_original === 'Gastos' && f.estado_mercancia === 'pagada')
        .reduce((sum, f) => sum + toNumber(f.total_a_pagar), 0),
      pagosTobiasOficial,
      pagosTobiasReal,
      pagosBancosOficial,
      pagosBancosReal,
      pagosCajaOficial,
      pagosCajaReal,
      desgloseTobias,
      desgloseBancos,
      desgloseCaja,
      totalImpuestosPagados: filteredFacturas
        .filter(f => f.estado_mercancia === 'pagada')
        .reduce((sum, f) => sum + toNumber(f.factura_iva), 0),
      totalImpuestos: filteredFacturas.reduce((sum, f) => sum + toNumber(f.factura_iva), 0),
      totalRetenciones: filteredFacturas
        .filter(f => f.tiene_retencion)
        .reduce((sum, f) => sum + calcularMontoRetencionReal(f), 0),
      facturasConRetencion: filteredFacturas.filter(f => f.tiene_retencion).length,
      prontoPagoUtilizado,
      prontoPagoNoUtilizado,
      facturasProntoPagoUtilizado: facturasProntoPagoUtilizado.length,
      facturasProntoPagoNoUtilizado: facturasProntoPagoNoUtilizado.length,
    };
  })();

  // Obtener opciones únicas para los filtros
  const uniqueProveedores = Array.from(
    new Map(facturas.map(f => [f.emisor_nit, { nit: f.emisor_nit, nombre: f.emisor_nombre }])).values()
  );
  const uniqueClasificaciones = [...new Set(facturas.map(f => f.clasificacion_original).filter(Boolean))];
  const uniqueMetodosPago = [...new Set(facturas.map(f => f.metodo_pago).filter(Boolean))];

  if (loading || loadingData) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ModernLayout>
    );
  }

  return (
    <ModernLayout
      title="Informes Avanzados"
      subtitle="Análisis completo de facturas con filtros y exportación"
    >
      <div className="space-y-6">
        {/* SECCIÓN 1: Resumen General */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <Receipt className="w-5 h-5 mr-2 text-blue-600" />
            Resumen General
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Receipt className="h-8 w-8 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Total Facturas</p>
                    <p className="text-2xl font-bold">{stats.totalFacturas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-gray-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Monto Total</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.totalMonto)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-green-700">Total Pagado</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(stats.totalPagadoReal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-red-700">Total Pendiente</p>
                    <p className="text-xl font-bold text-red-700">{formatCurrency(stats.totalPendiente)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Receipt className="h-8 w-8 text-indigo-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-indigo-700">Total Impuestos</p>
                    <p className="text-xl font-bold text-indigo-700">{formatCurrency(stats.totalImpuestos)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* SECCIÓN 2: Métodos de Pago */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
            Métodos de Pago
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Pago Tobías */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center mb-2">
                  <Building2 className="h-8 w-8 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Pagos por Tobías</p>
                  </div>
                </div>
                <div className="ml-11 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Oficial:</p>
                    <p className="text-sm font-bold text-blue-700">{formatCurrency(stats.pagosTobiasOficial)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Pagado:</p>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(stats.pagosTobiasReal)}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <p className="text-xs text-orange-600">Diferencia Total:</p>
                    <p className="text-xs font-medium text-orange-600">{formatCurrency(stats.pagosTobiasOficial - stats.pagosTobiasReal)}</p>
                  </div>
                  {(stats.desgloseTobias.totalProntoPago > 0 || stats.desgloseTobias.totalRetencion > 0 || stats.desgloseTobias.totalDescuentosAdicionales > 0) && (
                    <div className="ml-2 space-y-0.5 text-xs">
                      <div className="text-muted-foreground">Desglose:</div>
                      {stats.desgloseTobias.totalProntoPago > 0 && (
                        <div className="flex items-center justify-between text-green-600">
                          <span>• Pronto Pago:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseTobias.totalProntoPago)}</span>
                        </div>
                      )}
                      {stats.desgloseTobias.totalRetencion > 0 && (
                        <div className="flex items-center justify-between text-blue-600">
                          <span>• Retención:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseTobias.totalRetencion)}</span>
                        </div>
                      )}
                      {stats.desgloseTobias.totalDescuentosAdicionales > 0 && (
                        <div className="flex items-center justify-between text-purple-600">
                          <span>• Desc. Adicionales:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseTobias.totalDescuentosAdicionales)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Suma:</span>
                        <span className="font-medium">{formatCurrency(stats.desgloseTobias.totalProntoPago + stats.desgloseTobias.totalRetencion + stats.desgloseTobias.totalDescuentosAdicionales)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pago Bancos */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center mb-2">
                  <CreditCard className="h-8 w-8 text-green-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Pagos por Bancos</p>
                  </div>
                </div>
                <div className="ml-11 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Oficial:</p>
                    <p className="text-sm font-bold text-blue-700">{formatCurrency(stats.pagosBancosOficial)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Pagado:</p>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(stats.pagosBancosReal)}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <p className="text-xs text-orange-600">Diferencia Total:</p>
                    <p className="text-xs font-medium text-orange-600">{formatCurrency(stats.pagosBancosOficial - stats.pagosBancosReal)}</p>
                  </div>
                  {(stats.desgloseBancos.totalProntoPago > 0 || stats.desgloseBancos.totalRetencion > 0 || stats.desgloseBancos.totalDescuentosAdicionales > 0) && (
                    <div className="ml-2 space-y-0.5 text-xs">
                      <div className="text-muted-foreground">Desglose:</div>
                      {stats.desgloseBancos.totalProntoPago > 0 && (
                        <div className="flex items-center justify-between text-green-600">
                          <span>• Pronto Pago:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseBancos.totalProntoPago)}</span>
                        </div>
                      )}
                      {stats.desgloseBancos.totalRetencion > 0 && (
                        <div className="flex items-center justify-between text-blue-600">
                          <span>• Retención:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseBancos.totalRetencion)}</span>
                        </div>
                      )}
                      {stats.desgloseBancos.totalDescuentosAdicionales > 0 && (
                        <div className="flex items-center justify-between text-purple-600">
                          <span>• Desc. Adicionales:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseBancos.totalDescuentosAdicionales)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Suma:</span>
                        <span className="font-medium">{formatCurrency(stats.desgloseBancos.totalProntoPago + stats.desgloseBancos.totalRetencion + stats.desgloseBancos.totalDescuentosAdicionales)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pago Caja */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center mb-2">
                  <DollarSign className="h-8 w-8 text-purple-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Pagos por Caja</p>
                  </div>
                </div>
                <div className="ml-11 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Oficial:</p>
                    <p className="text-sm font-bold text-blue-700">{formatCurrency(stats.pagosCajaOficial)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Valor Pagado:</p>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(stats.pagosCajaReal)}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <p className="text-xs text-orange-600">Diferencia Total:</p>
                    <p className="text-xs font-medium text-orange-600">{formatCurrency(stats.pagosCajaOficial - stats.pagosCajaReal)}</p>
                  </div>
                  {(stats.desgloseCaja.totalProntoPago > 0 || stats.desgloseCaja.totalRetencion > 0 || stats.desgloseCaja.totalDescuentosAdicionales > 0) && (
                    <div className="ml-2 space-y-0.5 text-xs">
                      <div className="text-muted-foreground">Desglose:</div>
                      {stats.desgloseCaja.totalProntoPago > 0 && (
                        <div className="flex items-center justify-between text-green-600">
                          <span>• Pronto Pago:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseCaja.totalProntoPago)}</span>
                        </div>
                      )}
                      {stats.desgloseCaja.totalRetencion > 0 && (
                        <div className="flex items-center justify-between text-blue-600">
                          <span>• Retención:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseCaja.totalRetencion)}</span>
                        </div>
                      )}
                      {stats.desgloseCaja.totalDescuentosAdicionales > 0 && (
                        <div className="flex items-center justify-between text-purple-600">
                          <span>• Desc. Adicionales:</span>
                          <span className="font-medium">{formatCurrency(stats.desgloseCaja.totalDescuentosAdicionales)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Suma:</span>
                        <span className="font-medium">{formatCurrency(stats.desgloseCaja.totalProntoPago + stats.desgloseCaja.totalRetencion + stats.desgloseCaja.totalDescuentosAdicionales)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* SECCIÓN 3: Descuentos y Deducciones */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-teal-600" />
            Descuentos y Deducciones
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-teal-50">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-teal-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-teal-700">Pronto Pago Utilizado</p>
                    <p className="text-xl font-bold text-teal-700">{formatCurrency(stats.prontoPagoUtilizado)}</p>
                    <p className="text-xs text-teal-600 mt-1">
                      {stats.facturasProntoPagoUtilizado} facturas
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Clock className="h-8 w-8 text-gray-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-700">Pronto Pago No Utilizado</p>
                    <p className="text-xl font-bold text-gray-700">{formatCurrency(stats.prontoPagoNoUtilizado)}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {stats.facturasProntoPagoNoUtilizado} facturas
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-orange-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Total Retenciones</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.totalRetenciones)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.facturasConRetencion} facturas
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <Receipt className="h-8 w-8 text-indigo-600" />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground">Impuestos Pagados</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.totalImpuestosPagados)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      de {formatCurrency(stats.totalImpuestos)} total
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filtros Avanzados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filtros Avanzados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Búsqueda */}
              <div>
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Proveedor, factura, NIT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Tipo de Fecha */}
              <div>
                <Label htmlFor="tipoFecha">Filtrar por</Label>
                <Select
                  value={filters.tipoFecha}
                  onValueChange={(value: 'emision' | 'pago') => setFilters(prev => ({ ...prev, tipoFecha: value }))}
                >
                  <SelectTrigger id="tipoFecha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emision">Fecha de Emisión</SelectItem>
                    <SelectItem value="pago">Fecha de Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fechas de Emisión - Solo si tipoFecha es 'emision' */}
              {filters.tipoFecha === 'emision' && (
                <>
                  <div>
                    <Label htmlFor="fechaInicio">Fecha Emisión Inicio</Label>
                    <Input
                      id="fechaInicio"
                      type="date"
                      value={filters.fechaInicio}
                      onChange={(e) => setFilters(prev => ({ ...prev, fechaInicio: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="fechaFin">Fecha Emisión Fin</Label>
                    <Input
                      id="fechaFin"
                      type="date"
                      value={filters.fechaFin}
                      onChange={(e) => setFilters(prev => ({ ...prev, fechaFin: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* Fechas de Pago - Solo si tipoFecha es 'pago' */}
              {filters.tipoFecha === 'pago' && (
                <>
                  <div>
                    <Label htmlFor="fechaPagoInicio">Fecha Pago Inicio</Label>
                    <Input
                      id="fechaPagoInicio"
                      type="date"
                      value={filters.fechaPagoInicio}
                      onChange={(e) => setFilters(prev => ({ ...prev, fechaPagoInicio: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="fechaPagoFin">Fecha Pago Fin</Label>
                    <Input
                      id="fechaPagoFin"
                      type="date"
                      value={filters.fechaPagoFin}
                      onChange={(e) => setFilters(prev => ({ ...prev, fechaPagoFin: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* Proveedor */}
              <div>
                <Label htmlFor="proveedor">Proveedor</Label>
                <Select value={filters.proveedor || 'todos'} onValueChange={(value) => setFilters(prev => ({ ...prev, proveedor: value === 'todos' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los proveedores</SelectItem>
                    {uniqueProveedores.map(proveedor => (
                      <SelectItem key={proveedor.nit} value={proveedor.nit}>
                        {proveedor.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo: Mercancía o Gastos */}
              <div>
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={filters.clasificacion || 'todas'} onValueChange={(value) => setFilters(prev => ({ ...prev, clasificacion: value === 'todas' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="Mercancía">Mercancía</SelectItem>
                    <SelectItem value="Gastos">Gastos</SelectItem>
                    <SelectItem value="sistematizada">Sistematizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Estado de Pago */}
              <div>
                <Label htmlFor="estadoPago">Estado de Pago</Label>
                <Select value={filters.estadoPago || 'todos-estados'} onValueChange={(value) => setFilters(prev => ({ ...prev, estadoPago: value === 'todos-estados' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos-estados">Todos los estados</SelectItem>
                    <SelectItem value="pagada">Pagada</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Método de Pago */}
              <div>
                <Label htmlFor="metodoPago">Método de Pago</Label>
                <Select value={filters.metodoPago || 'todos-metodos'} onValueChange={(value) => setFilters(prev => ({ ...prev, metodoPago: value === 'todos-metodos' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos-metodos">Todos los métodos</SelectItem>
                    {uniqueMetodosPago.map(metodo => (
                      <SelectItem key={metodo} value={metodo}>
                        {metodo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Monto Mínimo */}
              <div>
                <Label htmlFor="montoMinimo">Monto Mínimo</Label>
                <Input
                  id="montoMinimo"
                  type="number"
                  placeholder="0"
                  value={filters.montoMinimo}
                  onChange={(e) => setFilters(prev => ({ ...prev, montoMinimo: e.target.value }))}
                />
              </div>

              {/* Ingreso al Sistema */}
              <div>
                <Label htmlFor="ingresoSistema">Ingreso al Sistema</Label>
                <Select value={filters.ingresoSistema || 'todos-ingreso'} onValueChange={(value) => setFilters(prev => ({ ...prev, ingresoSistema: value === 'todos-ingreso' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos-ingreso">Todas</SelectItem>
                    <SelectItem value="ingresado">Ingresadas al Sistema</SelectItem>
                    <SelectItem value="pendiente">Pendientes de Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={clearFilters}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Limpiar Filtros
              </Button>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Actualizar Datos
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Facturas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Facturas ({filteredFacturas.length} de {facturas.length})
              </CardTitle>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={selectedFacturas.length === filteredFacturas.length && filteredFacturas.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>Seleccionar todas ({selectedFacturas.length} seleccionadas)</span>
                </div>
                <Button 
                  onClick={exportToExcel}
                  disabled={selectedFacturas.length === 0}
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedFacturas.length === filteredFacturas.length && filteredFacturas.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[180px]">Proveedor</TableHead>
                    <TableHead className="w-[120px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs">N° Factura</span>
                        <span className="text-xs text-muted-foreground">Clasificación</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-[70px] text-xs">Serie</TableHead>
                    <TableHead className="w-[100px]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="h-8 p-0 hover:bg-transparent"
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-xs">Emisión</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </Button>
                    </TableHead>
                    <TableHead className="w-[100px] text-xs">Vencimiento</TableHead>
                    <TableHead className="w-[110px] text-right">Total Factura</TableHead>
                    <TableHead className="w-[110px] text-right">Total Pagado</TableHead>
                    <TableHead className="w-[90px]">Estado</TableHead>
                    <TableHead className="w-[100px] text-xs">Método Pago</TableHead>
                    <TableHead className="w-[50px] text-center">
                      <Eye className="h-4 w-4 mx-auto" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacturas.map((factura) => {
                    const diasVencimiento = getDaysToExpire(factura.fecha_vencimiento, factura.estado_mercancia);
                    const urgencyBadge = getUrgencyBadge(diasVencimiento);

                    return (
                      <TableRow key={factura.id} className="hover:bg-muted/30">
                        <TableCell className="py-3">
                          <Checkbox
                            checked={selectedFacturas.includes(factura.id)}
                            onCheckedChange={() => toggleSelection(factura.id)}
                          />
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm truncate max-w-[180px]" title={factura.emisor_nombre}>
                              {factura.emisor_nombre}
                            </span>
                            <span className="text-xs text-muted-foreground">{factura.emisor_nit}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <Link
                              to={getFacturaRoute(factura)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                            >
                              {factura.numero_factura}
                            </Link>
                            <Badge variant="outline" className="text-xs w-fit">
                              {(factura.clasificacion_original || factura.clasificacion || 'Sin clasificar').substring(0, 10)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {editingSerieId === factura.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="text"
                                value={editingSerieValue}
                                onChange={(e) => setEditingSerieValue(e.target.value)}
                                className="h-7 w-16 text-sm text-center"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveSerie(factura.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEdit();
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSaveSerie(factura.id)}
                              >
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2 group">
                              <span className="text-sm font-medium">{factura.numero_serie || '-'}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleEditSerie(factura.id, factura.numero_serie)}
                              >
                                <Edit2 className="h-3 w-3 text-blue-600" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{formatFechaSafe(factura.fecha_emision)}</span>
                            {urgencyBadge && (
                              <Badge className={`text-xs px-1.5 py-0 w-fit ${urgencyBadge.color}`}>
                                {urgencyBadge.text}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{formatFechaSafe(factura.fecha_vencimiento)}</span>
                            {factura.fecha_pago && (
                              <span className="text-xs text-blue-600">Pago: {formatFechaSafe(factura.fecha_pago)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span className="font-semibold text-sm">{formatCurrency(factura.total_a_pagar)}</span>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span className="font-semibold text-green-600 text-sm">
                            {formatCurrency(factura.valor_real_a_pagar || factura.monto_pagado || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={factura.estado_mercancia === 'pagada' ? 'default' : 'destructive'}
                              className="w-fit text-xs"
                            >
                              {factura.estado_mercancia || 'Pendiente'}
                            </Badge>
                            {diasVencimiento !== null && diasVencimiento < 0 && (
                              <span className="text-xs text-red-600 font-medium">
                                {Math.abs(diasVencimiento)}d
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-xs">
                          {factura.metodo_pago === 'Pago Partido' ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300">
                                Pago Partido
                              </Badge>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {getPagosPartidosPorFactura(factura.id).map((pp, idx) => (
                                  <div key={idx} className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    <span>{pp.metodo_pago}: {formatCurrency(pp.monto)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span>{factura.metodo_pago || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Botón Ver PDF de Factura */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                if (factura.pdf_file_path) {
                                  handleOpenPdf(factura.pdf_file_path);
                                } else {
                                  toast({
                                    title: "PDF no disponible",
                                    description: "Esta factura no tiene un PDF asociado",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              title={factura.pdf_file_path ? "Ver PDF de Factura" : "PDF no disponible"}
                              disabled={!factura.pdf_file_path || loadingPdf}
                            >
                              <Eye className={`h-4 w-4 ${factura.pdf_file_path ? 'text-blue-600' : 'text-gray-400'}`} />
                            </Button>

                            {/* Botón Descargar Comprobante de Pago */}
                            {factura.estado_mercancia === 'pagada' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => descargarComprobantePago(factura.id)}
                                title="Descargar Comprobante de Pago"
                              >
                                <Receipt className="h-4 w-4 text-green-600" />
                              </Button>
                            )}

                            {factura.estado_mercancia === 'pagada' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => descargarSoportePago(factura.id)}
                                title="Descargar Soporte del Pago"
                              >
                                <Paperclip className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal de visualización de PDF */}
        <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
          <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
            <DialogHeader className="p-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle>Visualizador de PDF</DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPdfDialogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 w-full overflow-hidden">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ModernLayout>
  );
}
