import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Estado = 'creado' | 'duplicado' | 'rechazado' | 'error';

interface FacturaSubida {
  pdf_file_path?: string | null;
  numero_factura?: string;
}

interface RespuestaSubida {
  estado: Estado;
  mensaje: string;
  factura?: FacturaSubida;
}

interface SubirFacturaZipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFacturaCreated: () => void | Promise<unknown>;
}

const LIMITE_MB = 10;

// invoke() deja el cuerpo en error.context cuando la función responde no-2xx.
async function leerRespuestaError(error: unknown): Promise<RespuestaSubida | null> {
  const contexto = (error as { context?: Response } | null)?.context;
  if (contexto && typeof contexto.json === 'function') {
    try {
      const cuerpo = await contexto.json();
      if (cuerpo && typeof cuerpo.mensaje === 'string') return cuerpo as RespuestaSubida;
    } catch {
      /* cuerpo no JSON */
    }
  }
  return null;
}

export function SubirFacturaZipDialog({ isOpen, onClose, onFacturaCreated }: SubirFacturaZipDialogProps) {
  const { toast } = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<RespuestaSubida | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const reiniciar = () => {
    setArchivo(null);
    setResultado(null);
    setPdfUrl(null);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  const cargarPdf = async (factura?: FacturaSubida) => {
    if (!factura?.pdf_file_path) return;
    const { data } = await supabase.storage.from('facturas-pdf').createSignedUrl(factura.pdf_file_path, 60 * 60);
    if (data?.signedUrl) setPdfUrl(data.signedUrl);
  };

  const mostrarToast = (r: RespuestaSubida) => {
    const titulo: Record<Estado, string> = {
      creado: 'Factura creada',
      duplicado: 'Factura duplicada',
      rechazado: 'Factura rechazada',
      error: 'Error al subir la factura',
    };
    toast({ title: titulo[r.estado], description: r.mensaje, variant: r.estado === 'creado' ? 'default' : 'destructive' });
  };

  const subir = async () => {
    if (!archivo) return;
    if (archivo.size > LIMITE_MB * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: `El ZIP no puede superar ${LIMITE_MB} MB.`, variant: 'destructive' });
      return;
    }

    setSubiendo(true);
    setResultado(null);
    setPdfUrl(null);
    try {
      const body = new FormData();
      body.append('zip', archivo);
      const { data, error } = await supabase.functions.invoke('subir-factura-zip', { body });

      let respuesta: RespuestaSubida | null = null;
      if (error) {
        respuesta = (await leerRespuestaError(error)) ?? { estado: 'error', mensaje: error.message || 'No se pudo subir el archivo.' };
      } else if (data && typeof data.mensaje === 'string') {
        respuesta = data as RespuestaSubida;
      } else {
        respuesta = { estado: 'error', mensaje: 'Respuesta inesperada del servidor.' };
      }

      setResultado(respuesta);
      mostrarToast(respuesta);

      if (respuesta.estado === 'creado' || respuesta.estado === 'duplicado') {
        await cargarPdf(respuesta.factura);
        await onFacturaCreated();
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo subir el archivo.';
      const r: RespuestaSubida = { estado: 'error', mensaje };
      setResultado(r);
      mostrarToast(r);
    } finally {
      setSubiendo(false);
    }
  };

  const exitoso = resultado?.estado === 'creado' || resultado?.estado === 'duplicado';

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir factura desde ZIP</DialogTitle>
          <DialogDescription>
            Sube el ZIP de la factura electrónica (XML y PDF de la DIAN). Se crea igual que las facturas que llegan por correo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="zip-factura">Archivo ZIP (máx. {LIMITE_MB} MB)</Label>
            <Input
              id="zip-factura"
              type="file"
              accept=".zip"
              disabled={subiendo}
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setResultado(null);
                setPdfUrl(null);
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cerrar} disabled={subiendo}>
              {exitoso ? 'Cerrar' : 'Cancelar'}
            </Button>
            <Button onClick={subir} disabled={!archivo || subiendo}>
              {subiendo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {subiendo ? 'Subiendo...' : 'Subir factura'}
            </Button>
          </div>

          {resultado && (
            <p className={resultado.estado === 'creado' ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
              {resultado.mensaje}
            </p>
          )}

          {exitoso && pdfUrl && (
            <iframe src={pdfUrl} title="PDF de la factura" className="w-full h-[60vh] rounded border" />
          )}
          {exitoso && !pdfUrl && (
            <p className="text-sm text-muted-foreground">
              {resultado?.factura?.pdf_file_path
                ? 'No se pudo cargar el PDF.'
                : 'Este ZIP no incluía un PDF, por lo que no hay nada para mostrar.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
