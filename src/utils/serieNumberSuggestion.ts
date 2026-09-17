import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/integrations/supabase/fetchAll';

/**
 * Tope de paginación para las consultas de series.
 *
 * El default de `fetchAllRows` (100.000) está pensado para listados que se
 * renderizan. Acá solo acumulamos strings cortos de una sola columna para
 * sacar un máximo, así que el techo puede ser mucho más alto sin costo real.
 */
const SERIES_MAX_ROWS = 5_000_000;

/** Fila mínima que devuelven las consultas de series. */
interface SerieRow {
  numero_serie: string | null;
}

/**
 * Extrae el número entero de una serie, o `null` si no lo tiene.
 *
 * `Number.isSafeInteger` descarta cadenas de dígitos tan largas que `parseInt`
 * pierde precisión: un número que ya no es exacto no sirve como consecutivo.
 */
function parseSerieNumber(raw: string): number | null {
  const num = Number.parseInt(raw, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export interface SeriePattern {
  prefix: string;
  numericPart: number;
  suffix: string;
  patternType: 'numeric' | 'alphanumeric' | 'complex';
  fullPattern: string;
}

export class SerieNumberSuggestion {
  /**
   * Analiza un número de serie y extrae su patrón
   */
  static analyzePattern(serie: string): SeriePattern {
    if (!serie) {
      return {
        prefix: '',
        numericPart: 0,
        suffix: '',
        patternType: 'numeric',
        fullPattern: serie
      };
    }

    // Buscar partes numéricas en el string
    const numericMatch = serie.match(/(\d+)/g);
    const lastNumericMatch = serie.match(/.*?(\d+)(?!.*\d)/);

    if (!numericMatch || !lastNumericMatch) {
      return {
        prefix: serie,
        numericPart: 1,
        suffix: '',
        patternType: 'alphanumeric',
        fullPattern: serie
      };
    }

    const lastNumeric = lastNumericMatch[1];
    const numericValue = parseInt(lastNumeric, 10);
    const numericIndex = serie.lastIndexOf(lastNumeric);

    const prefix = serie.substring(0, numericIndex);
    const suffix = serie.substring(numericIndex + lastNumeric.length);

    // Determinar tipo de patrón
    let patternType: 'numeric' | 'alphanumeric' | 'complex' = 'numeric';
    if (prefix.length > 0 || suffix.length > 0) {
      patternType = prefix.includes('-') || suffix.includes('-') ||
                   prefix.length > 3 || suffix.length > 3 ? 'complex' : 'alphanumeric';
    }

    return {
      prefix,
      numericPart: numericValue,
      suffix,
      patternType,
      fullPattern: serie
    };
  }

  /**
   * Obtiene los últimos números de serie de un emisor específico
   */
  static async getLastSeriesForEmisor(emisorNit: string, limit: number = 5): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('numero_serie')
        .eq('emisor_nit', emisorNit)
        .not('numero_serie', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching series:', error);
        return [];
      }

      // Filtrar valores null, undefined y strings vacíos en JavaScript
      return data?.map(item => item.numero_serie)
        .filter(serie => serie && serie.trim() !== '') || [];
    } catch (error) {
      console.error('Error in getLastSeriesForEmisor:', error);
      return [];
    }
  }

  /**
   * Obtiene una muestra de los números de serie más recientes.
   *
   * OJO: está acotada por `limit` a propósito (es para inspección, no para
   * calcular máximos). Para el consecutivo usá `suggestNextSerie`, que pagina
   * la tabla entera.
   */
  static async getAllSeries(limit: number = 100): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('numero_serie')
        .not('numero_serie', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching all series:', error);
        return [];
      }

      // Filtrar valores null, undefined y strings vacíos en JavaScript
      return data?.map(item => item.numero_serie)
        .filter(serie => serie && serie.trim() !== '') || [];
    } catch (error) {
      console.error('Error in getAllSeries:', error);
      return [];
    }
  }

  /**
   * Encuentra el número más alto en una lista de series
   */
  static findHighestNumber(series: string[]): { pattern: SeriePattern; value: number } | null {
    if (series.length === 0) return null;

    let highestPattern: SeriePattern | null = null;
    let highestValue = 0;

    // Sin log por serie: ahora esto puede recibir la tabla completa y un
    // console.log por iteración tira la consola abajo.
    for (const serie of series) {
      const pattern = this.analyzePattern(serie);

      if (pattern.numericPart > highestValue) {
        highestValue = pattern.numericPart;
        highestPattern = pattern;
      }
    }

    return highestPattern ? { pattern: highestPattern, value: highestValue } : null;
  }

  /**
   * Detecta el patrón más común de un emisor basado en sus últimas series
   */
  static detectCommonPattern(series: string[]): SeriePattern | null {
    if (series.length === 0) return null;

    const patterns = series.map(serie => this.analyzePattern(serie));

    // Buscar el patrón más común (mismo prefijo y sufijo)
    const patternMap = new Map<string, SeriePattern[]>();

    patterns.forEach(pattern => {
      const key = `${pattern.prefix}|${pattern.suffix}`;
      if (!patternMap.has(key)) {
        patternMap.set(key, []);
      }
      patternMap.get(key)!.push(pattern);
    });

    // Encontrar el patrón más usado
    let mostCommonPattern: SeriePattern[] = [];
    let maxCount = 0;

    for (const [, patternGroup] of patternMap) {
      if (patternGroup.length > maxCount) {
        maxCount = patternGroup.length;
        mostCommonPattern = patternGroup;
      }
    }

    if (mostCommonPattern.length === 0) return null;

    // Retornar el patrón con el número más alto
    return mostCommonPattern.reduce((max, current) =>
      current.numericPart > max.numericPart ? current : max
    );
  }

  /**
   * Genera el siguiente número de serie basado en el patrón detectado
   */
  static generateNextSerie(pattern: SeriePattern, increment: number = 1): string {
    const nextNumber = pattern.numericPart + increment;
    const paddedNumber = nextNumber.toString().padStart(
      pattern.numericPart.toString().length, '0'
    );

    return `${pattern.prefix}${paddedNumber}${pattern.suffix}`;
  }

  /**
   * Verifica si un número de serie ya existe en la base de datos
   */
  static async serieExists(numeroSerie: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('id')
        .eq('numero_serie', numeroSerie)
        .limit(1);

      if (error) {
        console.error('Error checking serie existence:', error);
        return false;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('Error in serieExists:', error);
      return false;
    }
  }

  /**
   * Sugiere el siguiente número de serie (siempre el mayor + 1 de TODA la base de datos)
   */
  static async suggestNextSerie(emisorNit: string): Promise<string | null> {
    try {
      // Paginado obligatorio: sin `.range()` PostgREST corta en 1000 filas sin
      // avisar, así que el "máximo" se calculaba sobre un recorte arbitrario de
      // la tabla y el consecutivo se estancaba alrededor de 1000.
      const rows = await fetchAllRows<SerieRow>(
        (from, to) => supabase
          .from('facturas')
          .select('numero_serie')
          .not('numero_serie', 'is', null)
          // Orden único: sin él el paginado saltea o duplica filas entre páginas.
          .order('id')
          .range(from, to),
        { label: 'series de facturas', maxRows: SERIES_MAX_ROWS }
      );

      // Buscar el número más alto en TODAS las series.
      // Se acumula en una variable en vez de `Math.max(...arr)`: el spread pasa
      // un argumento por elemento y pasadas las ~65k series revienta con
      // "Maximum call stack size exceeded".
      let maxNumber = 0;
      let totalSeries = 0;

      for (const { numero_serie } of rows) {
        const serie = String(numero_serie ?? '').trim();
        if (!serie) continue;
        totalSeries++;

        const matches = serie.match(/\d+/g);
        if (!matches) continue;

        for (const match of matches) {
          const num = parseSerieNumber(match);
          if (num !== null && num > maxNumber) maxNumber = num;
        }
      }

      if (totalSeries === 0) return '1';

      // Un log por llamada, no uno por serie: con la tabla completa el log
      // anterior escupía decenas de miles de líneas y congelaba la consola.
      console.log(`🎯 Series analizadas: ${totalSeries} · máximo: ${maxNumber} · sugerencia: ${maxNumber + 1}`);

      return (maxNumber + 1).toString();

    } catch (error) {
      console.error('Error in suggestNextSerie:', error);
      return null;
    }
  }

  /**
   * FUNCIÓN DE DEBUG - Muestra todos los datos para diagnosticar el problema
   */
  static async debugSeries(): Promise<void> {
    try {
      console.log('🔧 === DEBUG DE SERIES ===');

      // 1. Obtener TODAS las series (paginado: si esto corta en 1000 el debug
      //    diagnostica una tabla que no existe y manda a buscar el bug al lugar
      //    equivocado)
      const allData = await fetchAllRows<{
        numero_serie: string | null;
        emisor_nombre: string | null;
        emisor_nit: string | null;
      }>(
        (from, to) => supabase
          .from('facturas')
          .select('numero_serie, emisor_nombre, emisor_nit')
          .not('numero_serie', 'is', null)
          .order('id')
          .range(from, to),
        { label: 'series (debug)', maxRows: SERIES_MAX_ROWS }
      );

      console.log(`📊 Total de facturas con numero_serie: ${allData?.length || 0}`);

      if (allData && allData.length > 0) {
        // Filtrar datos válidos
        const validData = allData.filter(item => item.numero_serie && item.numero_serie.trim() !== '');

        console.log(`📋 Facturas con numero_serie válido: ${validData.length} de ${allData.length}`);
        console.log('📋 Primeras 10 series encontradas:');
        validData.slice(0, 10).forEach((item, index) => {
          console.log(`  ${index + 1}. Serie: "${item.numero_serie}" | Emisor: ${item.emisor_nombre} (${item.emisor_nit})`);
        });

        // 2. Analizar patrones
        const series = validData.map(item => item.numero_serie);
        console.log('\n🔍 Analizando patrones:');
        series.slice(0, 5).forEach((serie, index) => {
          const pattern = this.analyzePattern(serie);
          console.log(`  ${index + 1}. "${serie}" → prefix:"${pattern.prefix}", número:${pattern.numericPart}, suffix:"${pattern.suffix}"`);
        });

        // 3. Encontrar el más alto
        const highest = this.findHighestNumber(series);
        console.log('\n📈 Número más alto:', highest);

        // 4. Detectar patrón común
        const commonPattern = this.detectCommonPattern(series);
        console.log('\n📊 Patrón común:', commonPattern);
      } else {
        console.log('❌ No se encontraron series en la base de datos');
      }

      console.log('🔧 === FIN DEBUG ===');
    } catch (error) {
      console.error('❌ Error en debug:', error);
    }
  }

  /**
   * Obtiene información del patrón de series para mostrar en la UI
   */
  static async getPatternInfo(emisorNit: string): Promise<{
    lastSeries: string[];
    commonPattern: SeriePattern | null;
    suggestion: string | null;
  }> {
    const lastSeries = await this.getLastSeriesForEmisor(emisorNit);
    const commonPattern = this.detectCommonPattern(lastSeries);
    const suggestion = await this.suggestNextSerie(emisorNit);

    return {
      lastSeries,
      commonPattern,
      suggestion
    };
  }

  /**
   * Obtiene los números de serie disponibles (no usados) entre 1 y el máximo
   * Busca en TODAS las facturas de mercancía, no solo de un emisor específico
   */
  static async getAvailableSeries(): Promise<number[]> {
    try {
      // Mismo paginado que FacturasPorSerie: sin `.range()` esto veía solo 1000
      // filas arbitrarias, el máximo quedaba clavado cerca de 1000 y la lista de
      // "disponibles" inventaba huecos que en realidad ya estaban usados.
      const rows = await fetchAllRows<SerieRow>(
        (from, to) => supabase
          .from('facturas')
          .select('numero_serie')
          .in('clasificacion', ['mercancia', 'sistematizada'])
          .not('numero_serie', 'is', null)
          .order('id')
          .range(from, to),
        { label: 'series de mercancía', maxRows: SERIES_MAX_ROWS }
      );

      // Set en lugar de array: el `includes()` del loop de abajo es O(n) y
      // corriendo n veces daba O(n²) — con 50k series son 2.500 millones de
      // comparaciones y la pestaña se cuelga. Con Set cada lookup es O(1).
      const usadas = new Set<number>();
      let maxSerie = 0;

      for (const { numero_serie } of rows) {
        const serie = String(numero_serie ?? '').trim();
        if (!serie || serie === 'Sin serie') continue;

        const num = parseSerieNumber(serie);
        if (num === null || num < 1) continue;

        usadas.add(num);
        if (num > maxSerie) maxSerie = num;
      }

      if (usadas.size === 0) return [];

      // Encontrar las series faltantes del 1 al máximo
      const seriesFaltantes: number[] = [];
      for (let i = 1; i <= maxSerie; i++) {
        if (!usadas.has(i)) seriesFaltantes.push(i);
      }

      return seriesFaltantes;
    } catch (error) {
      console.error('Error in getAvailableSeries:', error);
      return [];
    }
  }
}