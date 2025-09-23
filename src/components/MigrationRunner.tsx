import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { migrateValorRealAPagar, verificarMigracion } from '@/utils/migrateValorRealAPagar';
import { useToast } from '@/hooks/use-toast';

export function MigrationRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const { toast } = useToast();

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runMigration = async () => {
    setIsRunning(true);
    setStatus('running');
    setProgress(0);
    setLogs([]);

    try {
      addLog('Iniciando migración de valor_real_a_pagar...');

      // Simular progreso durante la migración
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      await migrateValorRealAPagar();

      clearInterval(progressInterval);
      setProgress(100);

      addLog('Migración completada exitosamente');
      setStatus('completed');

      toast({
        title: "Migración completada",
        description: "Todos los valores de valor_real_a_pagar han sido calculados y guardados",
      });

    } catch (error) {
      addLog(`Error durante la migración: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      setStatus('error');

      toast({
        title: "Error en la migración",
        description: "La migración falló. Revisa los logs para más detalles.",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runVerification = async () => {
    setIsVerifying(true);

    try {
      addLog('Iniciando verificación...');
      await verificarMigracion();
      addLog('Verificación completada');

      toast({
        title: "Verificación completada",
        description: "Revisa los logs para ver el resultado",
      });

    } catch (error) {
      addLog(`Error durante la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`);

      toast({
        title: "Error en la verificación",
        description: "La verificación falló. Revisa los logs para más detalles.",
        variant: "destructive"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          Migración de Valor Real a Pagar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Esta migración calculará y guardará el valor_real_a_pagar para todas las facturas existentes.
            Solo se ejecutará en facturas que no tengan este valor calculado.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button
            onClick={runMigration}
            disabled={isRunning || isVerifying}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Ejecutando...' : 'Ejecutar Migración'}
          </Button>

          <Button
            variant="outline"
            onClick={runVerification}
            disabled={isRunning || isVerifying}
            className="flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {isVerifying ? 'Verificando...' : 'Verificar Estado'}
          </Button>
        </div>

        {status === 'running' && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">
              Progreso: {progress}%
            </p>
          </div>
        )}

        {status === 'completed' && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-green-600">
              Migración completada exitosamente
            </AlertDescription>
          </Alert>
        )}

        {status === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Error durante la migración. Revisa los logs abajo.
            </AlertDescription>
          </Alert>
        )}

        {logs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Logs:</h4>
            <div className="bg-muted p-3 rounded-md max-h-40 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap">
                {logs.join('\n')}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}