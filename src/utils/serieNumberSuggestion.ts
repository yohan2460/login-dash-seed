// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';

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
   * Obtiene TODOS los números de serie existentes en la base de datos
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

    console.log('🔍 Analizando series para encontrar el número más alto:', series);

    for (const serie of series) {
      const pattern = this.analyzePattern(serie);
      console.log(`📊 Serie: "${serie}" → Patrón: prefix:"${pattern.prefix}", número:${pattern.numericPart}, suffix:"${pattern.suffix}"`);

      if (pattern.numericPart > highestValue) {
        highestValue = pattern.numericPart;
        highestPattern = pattern;
        console.log(`📈 Nuevo número más alto: ${highestValue} (de la serie "${serie}")`);
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
      // Obtener TODAS las series de la base de datos (sin límite de emisor)
      console.log('🔍 Consultando TODAS las series en la base de datos...');

      const { data, error } = await supabase
        .from('facturas')
        .select('numero_serie')
        .not('numero_serie', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo series:', error);
        return '1';
      }

      // Filtrar valores válidos y convertir todo a string
      const allSeries = data?.map(item => item.numero_serie)
        .filter(serie => serie !== null && serie !== undefined && serie !== '')
        .map(serie => String(serie)) || [];

      if (allSeries.length === 0) {
        console.log('📝 No hay series en la BD, sugiriendo: 1');
        return '1';
      }

      console.log(`📋 Total de series encontradas: ${allSeries.length}`);

      // Buscar el número más alto en TODAS las series
      let maxNumber = 0;

      for (const serie of allSeries) {
        // Extraer todos los números de cada serie
        const matches = serie.match(/\d+/g);
        if (matches) {
          for (const match of matches) {
            const num = parseInt(match, 10);
            if (num > maxNumber) {
              maxNumber = num;
              console.log(`📈 Nuevo máximo encontrado: ${maxNumber} en serie "${serie}"`);
            }
          }
        }
      }

      // Sugerir el siguiente número
      const nextNumber = maxNumber + 1;
      console.log(`🎯 Número más alto: ${maxNumber}, sugiriendo: ${nextNumber}`);

      return nextNumber.toString();

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

      // 1. Obtener TODAS las series
      const { data: allData, error } = await supabase
        .from('facturas')
        .select('numero_serie, emisor_nombre, emisor_nit')
        .not('numero_serie', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo series:', error);
        return;
      }

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
      // Obtener todas las series de mercancía (igual que en FacturasPorSerie)
      const { data, error } = await supabase
        .from('facturas')
        .select('numero_serie')
        .in('clasificacion', ['mercancia', 'sistematizada'])
        .not('numero_serie', 'is', null);

      if (error) {
        console.error('Error fetching series:', error);
        return [];
      }

      // Extraer solo números válidos (igual que en FacturasPorSerie)
      const seriesNumericas = data
        ?.map(item => item.numero_serie)
        .filter(serie => serie && serie !== 'Sin serie' && !isNaN(parseInt(String(serie))))
        .map(serie => parseInt(String(serie)))
        .sort((a, b) => a - b) || [];

      if (seriesNumericas.length === 0) return [];

      // Encontrar el máximo
      const maxSerie = Math.max(...seriesNumericas);

      // Encontrar las series faltantes del 1 al máximo
      const seriesFaltantes: number[] = [];
      for (let i = 1; i <= maxSerie; i++) {
        if (!seriesNumericas.includes(i)) {
          seriesFaltantes.push(i);
        }
      }

      return seriesFaltantes;
    } catch (error) {
      console.error('Error in getAvailableSeries:', error);
      return [];
    }
  }
}