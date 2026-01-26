// Excel processor utilities for cuadrar sobordos

export interface ExcelProcessorResult {
  metadata: {
    fileName: string;
    processedAt: string;
    totalRows: number;
    type: 'dfds' | 'tme';
  };
  data: unknown;
}

export interface DFDSData {
  metadata: {
    fileName: string;
    processedAt: string;
    totalRows: number;
    type: 'dfds';
  };
  summary: Record<string, unknown>[];
  passengers: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
  boardingCards: Record<string, unknown>[];
}

export interface TMEData {
  metadata: {
    fileName: string;
    processedAt: string;
    totalRows: number;
    totalDataRows: number;
    duplicatesFound: number;
    type: 'tme';
  };
  headers: string[];
  data: Record<string, unknown>[];
}

export class ExcelProcessor {
  private static async processCSVFile(file: File, delimiter: string = ','): Promise<(string | null)[][]> {
    const Papa = await import('papaparse');
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          try {
            resolve(results.data as (string | null)[][]);
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => {
          reject(error);
        },
        skipEmptyLines: false,
        delimiter
      });
    });
  }

  private static async processExcelFile(file: File): Promise<(string | number | null)[][]> {
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number | null)[][];
  }

  private static arrayToObject(headers: string[], row: (string | number | null)[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || null;
    });
    return obj;
  }

  private static processDFDSData(rawData: (string | number | null)[][]): DFDSData {
    const sections: DFDSData = {
      metadata: {
        fileName: '',
        processedAt: new Date().toISOString(),
        totalRows: rawData.length,
        type: 'dfds'
      },
      summary: [],
      passengers: [],
      vehicles: [],
      boardingCards: []
    };

    let currentSection = '';
    let currentHeaders: string[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const firstCell = row[0]?.toString().trim();
      if (!firstCell) continue;

      // Detectar encabezados de sección
      if (firstCell === 'RESOURCE' || 
          (firstCell === 'SURNAME' && row[1]?.toString() === 'FIRST NAME') ||
          (firstCell === 'MAKE' && row[1]?.toString() === 'MODEL') ||
          firstCell === 'TYPE') {
        
        currentHeaders = row.filter((header): header is string | number => 
          header !== null && header !== undefined && header.toString().trim() !== ''
        ).map(header => header.toString());
        
        if (firstCell === 'RESOURCE') currentSection = 'summary';
        else if (firstCell === 'SURNAME') currentSection = 'passengers';
        else if (firstCell === 'MAKE') currentSection = 'vehicles';
        else if (firstCell === 'TYPE') currentSection = 'boardingCards';
        
        continue;
      }

      // Procesar datos según la sección actual
      if (currentSection && currentHeaders.length > 0) {
        const validCells = row.slice(0, currentHeaders.length).filter(cell => 
          cell !== null && cell !== undefined && cell !== ''
        );
        
        if (validCells.length > 0) {
          const obj = this.arrayToObject(currentHeaders, row);
          
          // Agregar STATUS para pasajeros y vehículos
          if (currentSection === 'passengers' || currentSection === 'vehicles') {
            obj.STATUS = 'Embarcado';
          }
          
          if (currentSection === 'summary') {
            sections.summary.push(obj);
          } else if (currentSection === 'passengers') {
            sections.passengers.push(obj);
          } else if (currentSection === 'vehicles') {
            sections.vehicles.push(obj);
          } else if (currentSection === 'boardingCards') {
            sections.boardingCards.push(obj);
          }
        }
      }
    }

    return sections;
  }

  private static processTMEData(rawData: (string | number | null)[][], fileType: 'dfds' | 'tme'): TMEData {
    if (rawData.length === 0) {
      throw new Error('El archivo está vacío');
    }

    const headers = rawData[0] as (string | number)[];
    const dataRows = rawData.slice(1);

    // Buscar campos importantes
    const findField = (keywords: string[]) => {
      return headers.find((header: string | number) => 
        keywords.some(keyword => header.toString().toLowerCase().includes(keyword.toLowerCase()))
      )?.toString() || null;
    };

    const couponField = findField(['cupon', 'ticket', 'numero', 'coupon']);
    const estadoField = findField(['estado', 'status', 'state']);

    // Filtrar filas válidas
    const validDataRows = dataRows.filter(row => {
      return row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== '');
    });

    // Función para limpiar cupones TME
    const cleanTMECoupon = (coupon: string): string => {
      if (!coupon) return coupon;
      
      const couponStr = coupon.toString().trim();
      
      if (couponStr.startsWith('1969') || couponStr.startsWith('2969')) {
        let remaining = couponStr.substring(4);
        remaining = remaining.replace(/^0+/, '');
        return remaining || couponStr;
      }
      
      return couponStr;
    };

    // Convertir a objetos
    const initialData = validDataRows.map(row => {
      const obj = this.arrayToObject(headers.map(h => h.toString()), row);
      
      // Limpiar cupón si es TME
      if (fileType === 'tme' && couponField && obj[couponField]) {
        obj[couponField] = cleanTMECoupon(obj[couponField]?.toString() || '');
      }
      
      // Determinar STATUS
      if (estadoField && obj[estadoField]) {
        const estado = obj[estadoField]?.toString().toLowerCase().trim();
        
        if (estado && estado.includes('embarque') && !estado.includes('desembarque')) {
          obj.STATUS = "Embarcado";
        } else if (estado && estado.includes('desembarque')) {
          obj.STATUS = "Cancelado";
        } else {
          obj.STATUS = "Sin Estado";
        }
      } else {
        obj.STATUS = "Sin Estado";
      }
      
      return obj;
    });

    // Detectar duplicados
    let duplicatesFound = 0;
    if (couponField) {
      const couponCount = new Map<string, number>();
      const couponIndices = new Map<string, number[]>();

      initialData.forEach((item, itemIndex) => {
        const coupon = item[couponField];
        if (coupon && coupon.toString().trim() !== '') {
          const couponStr = coupon.toString().trim();
          couponCount.set(couponStr, (couponCount.get(couponStr) || 0) + 1);
          
          if (!couponIndices.has(couponStr)) {
            couponIndices.set(couponStr, []);
          }
          couponIndices.get(couponStr)!.push(itemIndex);
        }
      });

      couponCount.forEach((count, coupon) => {
        if (count > 1) {
          duplicatesFound += count;
          const indices = couponIndices.get(coupon) || [];
          indices.forEach((itemIndex, duplicateNumber) => {
            initialData[itemIndex].Duplicado = duplicateNumber + 1;
          });
        }
      });
    }

    return {
      metadata: {
        fileName: '',
        processedAt: new Date().toISOString(),
        totalRows: rawData.length,
        totalDataRows: initialData.length,
        duplicatesFound,
        type: 'tme'
      },
      headers: headers.map(h => h.toString()),
      data: initialData
    };
  }

  static async processFile(file: File, type: 'dfds' | 'tme'): Promise<ExcelProcessorResult> {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    let rawData: (string | number | null)[][] = [];
    
    if (fileExtension === 'csv') {
      const delimiter = type === 'dfds' ? ';' : ',';
      rawData = await this.processCSVFile(file, delimiter);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      rawData = await this.processExcelFile(file);
    } else {
      throw new Error('Formato de archivo no soportado. Use CSV o Excel.');
    }

    let processedResult: DFDSData | TMEData;
    if (type === 'dfds') {
      processedResult = this.processDFDSData(rawData);
    } else {
      processedResult = this.processTMEData(rawData, type);
    }

    // Actualizar metadata
    processedResult.metadata.fileName = file.name;

    return {
      metadata: {
        fileName: file.name,
        processedAt: new Date().toISOString(),
        totalRows: rawData.length,
        type
      },
      data: processedResult
    };
  }
}

