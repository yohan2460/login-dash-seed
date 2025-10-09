import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ModernLayout } from '@/components/ModernLayout';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Plus, History, Search, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface SaldoFavor {
  id: string;
  emisor_nombre: string;
  emisor_nit: string;
  monto_inicial: number;
  saldo_disponible: number;
  factura_origen_id: string | null;
  numero_factura_origen: string | null;
  motivo: 'pago_exceso' | 'nota_credito' | 'ajuste_manual';
  descripcion: string | null;
  fecha_generacion: string;
  estado: 'activo' | 'agotado' | 'cancelado';
  created_at: string;
  medio_pago: MedioPago;
}

interface AplicacionSaldo {
  id: string;
  saldo_favor_id: string;
  factura_destino_id: string;
  monto_aplicado: number;
  fecha_aplicacion: string;
  factura_numero?: string;
  medio_pago?: MedioPago | null;
}

interface ProveedorConSaldo {
  emisor_nit: string;
  emisor_nombre: string;
  total_saldo_disponible: number;
  cantidad_saldos: number;
  saldos: SaldoFavor[];
}

type MedioPago = 'Pago Banco' | 'Pago Tobías' | 'Caja';
const MEDIOS_PAGO: MedioPago[] = ['Pago Banco', 'Pago Tobías', 'Caja'];

export default function SaldosFavor() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [saldos, setSaldos] = useState<SaldoFavor[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedProveedor, setSelectedProveedor] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedSaldo, setSelectedSaldo] = useState<SaldoFavor | null>(null);
  const [aplicaciones, setAplicaciones] = useState<AplicacionSaldo[]>([]);

  // Form states para crear saldo
  const [formEmisorNombre, setFormEmisorNombre] = useState('');
  const [formEmisorNit, setFormEmisorNit] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formMotivo, setFormMotivo] = useState<'pago_exceso' | 'nota_credito' | 'ajuste_manual'>('pago_exceso');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formNumeroFacturaOrigen, setFormNumeroFacturaOrigen] = useState('');
  const [formMedioPago, setFormMedioPago] = useState<MedioPago>('Pago Banco');

  useEffect(() => {
    if (user) {
      fetchSaldos();
    }
  }, [user]);

  const fetchSaldos = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('saldos_favor')
        .select('*')
        .order('fecha_generacion', { ascending: false });

      if (error) throw error;
      setSaldos(data || []);
    } catch (error) {
      console.error('Error al cargar saldos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los saldos a favor",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateSaldo = async () => {
    if (!formEmisorNombre || !formEmisorNit || !formMonto) {
      toast({
        title: "Campos requeridos",
        description: "Completa todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    const monto = parseFloat(formMonto.replace(/[^0-9.]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      toast({
        title: "Monto inválido",
        description: "El monto debe ser mayor a 0",
        variant: "destructive",
      });
      return;
    }

    try {
      // Obtener el user_id del usuario autenticado
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error('No se pudo obtener el usuario autenticado');
      }

      const { error } = await supabase
        .from('saldos_favor')
        .insert({
          user_id: userData.user.id,
          emisor_nombre: formEmisorNombre,
          emisor_nit: formEmisorNit,
          monto_inicial: monto,
          saldo_disponible: monto,
          numero_factura_origen: formNumeroFacturaOrigen || null,
          motivo: formMotivo,
          descripcion: formDescripcion || null,
          medio_pago: formMedioPago,
        });

      if (error) throw error;

      toast({
        title: "Saldo creado",
        description: `Saldo a favor de ${formatCurrency(monto)} creado exitosamente`,
      });

      // Reset form
      setFormEmisorNombre('');
      setFormEmisorNit('');
      setFormMonto('');
      setFormMotivo('pago_exceso');
      setFormDescripcion('');
      setFormNumeroFacturaOrigen('');
      setFormMedioPago('Pago Banco');
      setShowCreateDialog(false);
      fetchSaldos();
    } catch (error) {
      console.error('Error al crear saldo:', error);
      toast({
        title: "Error",
        description: "No se pudo crear el saldo a favor",
        variant: "destructive",
      });
    }
  };

  const handleViewHistory = async (saldo: SaldoFavor) => {
    setSelectedSaldo(saldo);
    try {
      const { data, error } = await supabase
        .from('aplicaciones_saldo')
        .select(`
          *,
          facturas:factura_destino_id (numero_factura)
        `)
        .eq('saldo_favor_id', saldo.id)
        .order('fecha_aplicacion', { ascending: false });

      if (error) throw error;

      const aplicacionesConFactura = (data || []).map(app => ({
        ...app,
        factura_numero: (app.facturas as any)?.numero_factura || 'N/A',
        medio_pago: app.medio_pago || saldo.medio_pago
      }));

      setAplicaciones(aplicacionesConFactura);
      setShowHistoryDialog(true);
    } catch (error) {
      console.error('Error al cargar historial:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar el historial",
        variant: "destructive",
      });
    }
  };

  const handleCancelSaldo = async (saldoId: string) => {
    if (!confirm('¿Estás seguro de cancelar este saldo a favor?')) return;

    try {
      const { error } = await supabase
        .from('saldos_favor')
        .update({ estado: 'cancelado' })
        .eq('id', saldoId);

      if (error) throw error;

      toast({
        title: "Saldo cancelado",
        description: "El saldo a favor ha sido cancelado",
      });
      fetchSaldos();
    } catch (error) {
      console.error('Error al cancelar saldo:', error);
      toast({
        title: "Error",
        description: "No se pudo cancelar el saldo",
        variant: "destructive",
      });
    }
  };

  // Agrupar saldos por proveedor
  const agruparPorProveedor = (): ProveedorConSaldo[] => {
    const grupos: { [key: string]: ProveedorConSaldo } = {};

    const saldosFiltrados = searchKeyword
      ? saldos.filter(s =>
          s.emisor_nombre.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          s.emisor_nit.includes(searchKeyword)
        )
      : saldos;

    saldosFiltrados.forEach(saldo => {
      if (!grupos[saldo.emisor_nit]) {
        grupos[saldo.emisor_nit] = {
          emisor_nit: saldo.emisor_nit,
          emisor_nombre: saldo.emisor_nombre,
          total_saldo_disponible: 0,
          cantidad_saldos: 0,
          saldos: []
        };
      }

      grupos[saldo.emisor_nit].saldos.push(saldo);
      grupos[saldo.emisor_nit].cantidad_saldos++;
      if (saldo.estado === 'activo') {
        grupos[saldo.emisor_nit].total_saldo_disponible += saldo.saldo_disponible;
      }
    });

    return Object.values(grupos).sort((a, b) => b.total_saldo_disponible - a.total_saldo_disponible);
  };

  const proveedoresConSaldo = agruparPorProveedor();
  const totalSaldosDisponibles = saldos
    .filter(s => s.estado === 'activo')
    .reduce((sum, s) => sum + s.saldo_disponible, 0);
  const totalSaldosActivos = saldos.filter(s => s.estado === 'activo').length;

  const getMotivoLabel = (motivo: string) => {
    const labels = {
      'pago_exceso': 'Pago en Exceso',
      'nota_credito': 'Nota de Crédito',
      'ajuste_manual': 'Ajuste Manual'
    };
    return labels[motivo as keyof typeof labels] || motivo;
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'activo':
        return <Badge className="bg-green-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />Activo</Badge>;
      case 'agotado':
        return <Badge className="bg-gray-600 text-white"><AlertCircle className="w-3 h-3 mr-1" />Agotado</Badge>;
      case 'cancelado':
        return <Badge className="bg-red-600 text-white"><XCircle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  if (loadingData) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ModernLayout>
    );
  }

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wallet className="w-8 h-8 text-green-600" />
              Saldos a Favor
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestiona los saldos a favor de tus proveedores
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchSaldos} variant="outline">
              <TrendingUp className="w-4 h-4 mr-2" />
              Actualizar
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Crear Saldo
            </Button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                Total Disponible
              </p>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalSaldosDisponibles)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">Saldos Activos</p>
              <div className="text-2xl font-bold">{totalSaldosActivos}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">Proveedores</p>
              <div className="text-2xl font-bold">{proveedoresConSaldo.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Búsqueda */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por proveedor o NIT..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Lista por Proveedor */}
        <div className="space-y-4">
          {proveedoresConSaldo.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay saldos a favor</h3>
                <p className="text-sm text-muted-foreground">
                  Los saldos a favor aparecerán aquí cuando se generen
                </p>
              </CardContent>
            </Card>
          ) : (
            proveedoresConSaldo.map(proveedor => (
              <Card key={proveedor.emisor_nit}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{proveedor.emisor_nombre}</CardTitle>
                      <CardDescription>NIT: {proveedor.emisor_nit}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-600">
                        {formatCurrency(proveedor.total_saldo_disponible)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {proveedor.cantidad_saldos} saldo(s)
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Medio de Pago</TableHead>
                      <TableHead>Factura Origen</TableHead>
                      <TableHead className="text-right">Monto Inicial</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proveedor.saldos.map(saldo => (
                        <TableRow key={saldo.id}>
                          <TableCell className="text-sm">
                            {new Date(saldo.fecha_generacion).toLocaleDateString('es-CO')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getMotivoLabel(saldo.motivo)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {saldo.medio_pago}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {saldo.numero_factura_origen || '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(saldo.monto_inicial)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(saldo.saldo_disponible)}
                          </TableCell>
                          <TableCell>{getEstadoBadge(saldo.estado)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewHistory(saldo)}
                              >
                                <History className="w-4 h-4" />
                              </Button>
                              {saldo.estado === 'activo' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelSaldo(saldo.id)}
                                >
                                  <XCircle className="w-4 h-4 text-red-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Dialog: Crear Saldo */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Saldo a Favor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Proveedor *</Label>
              <Input
                placeholder="Nombre del proveedor"
                value={formEmisorNombre}
                onChange={(e) => setFormEmisorNombre(e.target.value)}
              />
            </div>
            <div>
              <Label>NIT *</Label>
              <Input
                placeholder="NIT del proveedor"
                value={formEmisorNit}
                onChange={(e) => setFormEmisorNit(e.target.value)}
              />
            </div>
            <div>
              <Label>Monto *</Label>
              <Input
                type="text"
                placeholder="0"
                value={formMonto}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setFormMonto(val);
                }}
              />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select value={formMotivo} onValueChange={(v: any) => setFormMotivo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago_exceso">Pago en Exceso</SelectItem>
                  <SelectItem value="nota_credito">Nota de Crédito</SelectItem>
                  <SelectItem value="ajuste_manual">Ajuste Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Medio de Pago *</Label>
              <Select value={formMedioPago} onValueChange={(v: MedioPago) => setFormMedioPago(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIOS_PAGO.map(medio => (
                    <SelectItem key={medio} value={medio}>
                      {medio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>N° Factura Origen (opcional)</Label>
              <Input
                placeholder="Número de factura"
                value={formNumeroFacturaOrigen}
                onChange={(e) => setFormNumeroFacturaOrigen(e.target.value)}
              />
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Textarea
                placeholder="Detalles adicionales..."
                value={formDescripcion}
                onChange={(e) => setFormDescripcion(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSaldo}>Crear Saldo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Historial */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de Aplicaciones</DialogTitle>
          </DialogHeader>
          {selectedSaldo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Proveedor</p>
                  <p className="font-semibold">{selectedSaldo.emisor_nombre}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monto Inicial</p>
                  <p className="font-semibold">{formatCurrency(selectedSaldo.monto_inicial)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Disponible</p>
                  <p className="font-semibold text-green-600">
                    {formatCurrency(selectedSaldo.saldo_disponible)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aplicado</p>
                  <p className="font-semibold">
                    {formatCurrency(selectedSaldo.monto_inicial - selectedSaldo.saldo_disponible)}
                  </p>
                </div>
              </div>

              {aplicaciones.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No hay aplicaciones registradas
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura Destino</TableHead>
                      <TableHead>Medio</TableHead>
                      <TableHead className="text-right">Monto Aplicado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aplicaciones.map(app => (
                      <TableRow key={app.id}>
                        <TableCell>
                          {new Date(app.fecha_aplicacion).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell>{app.factura_numero}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {app.medio_pago || selectedSaldo.medio_pago}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(app.monto_aplicado)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowHistoryDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModernLayout>
  );
}
