import { describe, expect, it } from 'vitest';
import { procesarZipSubido } from './procesarZipSubido.ts';
import type { PayloadEnvio, ResultadoEnvio, WebhookFacturas } from '../ingest-correos/procesarLote.ts';
import { construirZip, construirZipFactura } from '../_shared/dian/__fixtures__/constructores.ts';

const USER_ID = '00000000-0000-0000-0000-000000000000';
const AHORA = Date.UTC(2026, 9, 10, 15, 0, 0);

function armar(respuesta: ResultadoEnvio | Error) {
  const envios: { payload: PayloadEnvio; pdf: unknown }[] = [];
  const webhook: WebhookFacturas = {
    enviar: async (payload, pdf) => {
      envios.push({ payload, pdf });
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  };
  return { webhook, envios };
}
const ejecutar = (bytes: Uint8Array, r: ResultadoEnvio | Error = { tipo: 'creado' }) => {
  const f = armar(r);
  return procesarZipSubido(bytes, { webhook: f.webhook, ahoraMs: AHORA, userId: USER_ID }).then((res) => ({ res, ...f }));
};

describe('procesarZipSubido', () => {
  it('crea la factura y envia el payload completo con el PDF', async () => {
    const factura = { id: 'f1', pdf_file_path: 'facturas/x/y.pdf' };
    const { res, envios } = await ejecutar(construirZipFactura({ numero: 'FE9021' }), { tipo: 'creado', factura });
    expect(res.estado).toBe('creado');
    expect(res.estado === 'creado' && res.factura).toEqual(factura);
    expect(envios).toHaveLength(1);
    expect(envios[0].payload.user_id).toBe(USER_ID);
    expect(envios[0].payload.nombre_carpeta_factura).toBe('10/10/2026_FE9021');
    expect(envios[0].payload.fecha_vencimiento).toBeTruthy();
    expect(envios[0].pdf).toBeTruthy();
  });

  it('informa duplicado', async () => {
    const { res } = await ejecutar(construirZipFactura(), { tipo: 'duplicado', factura: { id: 'f1' } });
    expect(res.estado).toBe('duplicado');
    expect(res.mensaje).toMatch(/ya existe/i);
  });

  it('duplicado sin factura (409) sigue siendo duplicado', async () => {
    const { res } = await ejecutar(construirZipFactura(), { tipo: 'duplicado' });
    expect(res).toMatchObject({ estado: 'duplicado' });
  });

  it('rechaza nota credito sin llamar al webhook', async () => {
    const { res, envios } = await ejecutar(construirZipFactura({ raiz: 'CreditNote', codigoTipo: '91' }));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'NOTA_CREDITO' });
    expect(res.mensaje).toMatch(/nota cr/i);
    expect(envios).toHaveLength(0);
  });

  it('rechaza nota debito', async () => {
    const { res } = await ejecutar(construirZipFactura({ raiz: 'DebitNote', codigoTipo: '92' }));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'NOTA_DEBITO' });
  });

  it('rechaza tipo no soportado', async () => {
    const { res } = await ejecutar(construirZipFactura({ codigoTipo: '99' }));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'TIPO_NO_SOPORTADO' });
  });

  it('rechaza datos incompletos', async () => {
    const { res } = await ejecutar(construirZipFactura({ payable: null, taxInclusive: '' }));
    expect(res.estado).toBe('rechazado');
  });

  it('rechaza zip vacio', async () => {
    const { res } = await ejecutar(new Uint8Array(0));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'ZIP_VACIO' });
    expect(res.mensaje).toMatch(/vac/i);
  });

  it('rechaza zip corrupto', async () => {
    const { res } = await ejecutar(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'ZIP_CORRUPTO' });
  });

  it('rechaza zip sin xml', async () => {
    const { res } = await ejecutar(construirZip({ 'a.pdf': new Uint8Array([1]) }));
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'ZIP_SIN_XML' });
  });

  it('rechaza xml invalido', async () => {
    const { res } = await ejecutar(construirZip({ 'a.xml': '<<<no es xml' }));
    expect(res.estado).toBe('rechazado');
  });

  it('rechazo 4xx del webhook', async () => {
    const { res } = await ejecutar(construirZipFactura(), { tipo: 'rechazado', estado: 400, detalle: 'faltan campos' });
    expect(res).toMatchObject({ estado: 'rechazado', motivo: 'WEBHOOK_400' });
    expect(res.mensaje).toContain('faltan campos');
  });

  it('error transitorio del webhook', async () => {
    const { res } = await ejecutar(construirZipFactura(), { tipo: 'error', detalle: 'HTTP 500' });
    expect(res.estado).toBe('error');
  });

  it('excepcion del webhook se vuelve error', async () => {
    const { res } = await ejecutar(construirZipFactura(), new Error('boom'));
    expect(res.estado).toBe('error');
  });
});
