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
        .neq('numero_serie', '')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching series:', error);
        return [];
      }

      return data?.map(item => item.numero_serie).filter(Boolean) || [];
    } catch (error) {
      console.error('Error in getLastSeriesForEmisor:', error);
      return [];
    }
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
   * Sugiere el siguiente número de serie para un emisor específico
   */
  static async suggestNextSerie(emisorNit: string): Promise<string | null> {
    try {
      const lastSeries = await this.getLastSeriesForEmisor(emisorNit);

      if (lastSeries.length === 0) {
        // Si no hay series previas, sugerir un patrón inicial
        return '001';
      }

      const commonPattern = this.detectCommonPattern(lastSeries);

      if (!commonPattern) {
        // Si no se puede detectar un patrón, incrementar el último número encontrado
        const lastSerie = lastSeries[0];
        const pattern = this.analyzePattern(lastSerie);
        return this.generateNextSerie(pattern);
      }

      // Generar sugerencia basada en el patrón común
      let suggestion = this.generateNextSerie(commonPattern);
      let increment = 1;

      // Verificar que la sugerencia no exista ya (máximo 10 intentos)
      while (await this.serieExists(suggestion) && increment <= 10) {
        increment++;
        suggestion = this.generateNextSerie(commonPattern, increment);
      }

      return suggestion;
    } catch (error) {
      console.error('Error in suggestNextSerie:', error);
      return null;
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
}