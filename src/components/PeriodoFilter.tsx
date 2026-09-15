import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MESES, TODOS, hayPeriodoActivo, type Periodo } from '@/utils/periodo';

interface PeriodoFilterProps {
  /** Años presentes en los datos, de obtenerAniosDisponibles(). */
  anios: string[];
  periodo: Periodo;
  onChange: (periodo: Periodo) => void;
  /** false para mostrar solo el selector de año. */
  mostrarMes?: boolean;
  /** false para ocultar el botón de limpiar (útil si la página ya tiene uno general). */
  mostrarLimpiar?: boolean;
  className?: string;
}

/**
 * Selector de Año + Mes compartido por todas las pantallas con filtro de fecha.
 *
 * Existe porque FacturasPorSerie filtraba por mes SIN año: elegir "Enero"
 * mostraba enero de todos los años sumados en la misma vista, y sus totales
 * eran la suma de todos los eneros de la historia.
 *
 * Los años los recibe ya derivados de la data real (no hardcodeados), así que
 * nunca se ofrece un año que no tenga facturas.
 */
export function PeriodoFilter({
  anios,
  periodo,
  onChange,
  mostrarMes = true,
  mostrarLimpiar = true,
  className,
}: PeriodoFilterProps) {
  const activo = hayPeriodoActivo(periodo);

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="space-y-1.5">
        <Label htmlFor="periodo-anio" className="text-xs text-muted-foreground">
          Año
        </Label>
        <Select
          value={periodo.anio}
          onValueChange={anio => onChange({ ...periodo, anio })}
        >
          <SelectTrigger id="periodo-anio" className="w-[130px]">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los años</SelectItem>
            {anios.map(anio => (
              <SelectItem key={anio} value={anio}>
                {anio}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mostrarMes && (
        <div className="space-y-1.5">
          <Label htmlFor="periodo-mes" className="text-xs text-muted-foreground">
            Mes
          </Label>
          <Select
            value={periodo.mes}
            onValueChange={mes => onChange({ ...periodo, mes })}
          >
            <SelectTrigger id="periodo-mes" className="w-[160px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los meses</SelectItem>
              {MESES.map(mes => (
                <SelectItem key={mes.value} value={mes.value}>
                  {mes.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mostrarLimpiar && activo && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ anio: TODOS, mes: TODOS })}
          className="h-10"
        >
          <X className="mr-1 h-4 w-4" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
