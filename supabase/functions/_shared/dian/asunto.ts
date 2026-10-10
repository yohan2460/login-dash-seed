// NOTA DENO: este módulo (y los hermanos) importan `fflate` y `fast-xml-parser`
// como bare imports. En la función que los use hay que mapearlos en su deno.json:
//   "imports": { "fflate": "npm:fflate@0.8.3", "fast-xml-parser": "npm:fast-xml-parser@5.11.2" }
// (mantener las versiones iguales a las de package.json). Sin APIs de Node.

export interface AsuntoDian {
  nit: string;
  razonSocial: string;
  numero: string;
  tipoDocumento: string;
}

// Asunto estándar DIAN: "NIT;RazonSocial;Numero;TipoDoc;..." con espacios variables.
// 01 = factura de venta, 91 = nota crédito, 92 = nota débito.
export function parsearAsuntoDian(asunto: string): AsuntoDian | null {
  const partes = asunto.split(';').map((p) => p.trim());
  if (partes.length < 4) return null;
  const [nit, razonSocial, numero, tipoDocumento] = partes;
  if (!/^\d+$/.test(nit)) return null;
  if (!numero) return null;
  if (!/^\d{2}$/.test(tipoDocumento)) return null;
  return { nit, razonSocial, numero, tipoDocumento };
}
