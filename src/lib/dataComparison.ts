// Data comparison utilities for cuadrar sobordos

export interface TableRow {
  ticketNumber: string;
  fullName: string;
  documentOrLicense: string;
  accessType: string;
  ticketType: string;
  dfdsStatus: string;
  tmeStatus: string;
  source: 'dfds' | 'tme' | 'both';
}

export interface ComparisonStats {
  totalRecords: number;
  matchedRecords: number;
  onlyInDFDS: number;
  onlyInTME: number;
  duplicates: number;
  incidences: number;
}

export interface DFDSRecord {
  passengers?: Record<string, unknown>[];
  vehicles?: Record<string, unknown>[];
}

export interface TMERecord {
  data: Record<string, unknown>[];
  headers: string[];
}

export class DataComparer {
  static compareData(dfdsData: unknown, tmeData: unknown, tmeCouponField: string): {
    incidences: TableRow[];
    stats: ComparisonStats;
  } {
    if (!dfdsData || !tmeData || !tmeCouponField) {
      return {
        incidences: [],
        stats: {
          totalRecords: 0,
          matchedRecords: 0,
          onlyInDFDS: 0,
          onlyInTME: 0,
          duplicates: 0,
          incidences: 0
        }
      };
    }

    // Type guards
    const isDFDSData = (data: unknown): data is DFDSRecord => {
      return typeof data === 'object' && data !== null;
    };

    const isTMEData = (data: unknown): data is TMERecord => {
      return typeof data === 'object' && data !== null && 
             'data' in data && Array.isArray((data as Record<string, unknown>).data) &&
             'headers' in data && Array.isArray((data as Record<string, unknown>).headers);
    };

    if (!isDFDSData(dfdsData) || !isTMEData(tmeData)) {
      return {
        incidences: [],
        stats: {
          totalRecords: 0,
          matchedRecords: 0,
          onlyInDFDS: 0,
          onlyInTME: 0,
          duplicates: 0,
          incidences: 0
        }
      };
    }

    if (!tmeData.headers.includes(tmeCouponField)) {
      return {
        incidences: [],
        stats: {
          totalRecords: 0,
          matchedRecords: 0,
          onlyInDFDS: 0,
          onlyInTME: 0,
          duplicates: 0,
          incidences: 0
        }
      };
    }

    const incidences: TableRow[] = [];

    // Crear array con todos los registros DFDS
    const allDFDSRecords: Record<string, unknown>[] = [
      ...(dfdsData.passengers || []),
      ...(dfdsData.vehicles || [])
    ];

    const dfdsTicketNumbers = allDFDSRecords
      .map(record => record["TICKET NUMBER"]?.toString() || '')
      .filter(ticket => ticket.trim() !== '');

    // CASO 1: Cupones TME sin correspondencia en DFDS (excluir cancelados y duplicados)
    tmeData.data.forEach((tmeRecord) => {
      const tmeCoupon = tmeRecord[tmeCouponField]?.toString() || '';
      const tmeStatus = tmeRecord["STATUS"]?.toString() || '';
      
      if (!tmeCoupon.trim()) return;
      if (tmeStatus.toLowerCase() === 'cancelado') return;
      
      const isDuplicated = tmeRecord["Duplicado"] !== undefined && tmeRecord["Duplicado"] !== null;
      if (isDuplicated) return;

      const matchingDFDSTicket = dfdsTicketNumbers.find(dfdsTicket => {
        return tmeCoupon.includes(dfdsTicket) || dfdsTicket.includes(tmeCoupon);
      });

      if (!matchingDFDSTicket) {
        const nameFields = tmeData.headers.filter((header: string) => 
          header.toLowerCase().includes('nombre') || 
          header.toLowerCase().includes('apellido') ||
          header.toLowerCase().includes('name')
        );
        const documentFields = tmeData.headers.filter((header: string) => 
          header.toLowerCase().includes('documento') ||
          header.toLowerCase().includes('dni') ||
          header.toLowerCase().includes('pasaporte') ||
          header.toLowerCase().includes('document')
        );
        const accessTypeField = tmeData.headers.find((header: string) => 
          header.toLowerCase().includes('tipo acceso') || 
          header.toLowerCase().includes('acceso') || 
          header.toLowerCase().includes('access') || 
          header.toLowerCase().includes('categoria')
        );
        const ticketTypeField = tmeData.headers.find((header: string) => 
          header.toLowerCase().includes('tipo billete') || 
          header.toLowerCase().includes('billete') || 
          header.toLowerCase().includes('ticket') || 
          header.toLowerCase().includes('tarifa')
        );

        incidences.push({
          ticketNumber: tmeCoupon,
          fullName: nameFields.length > 0 ? 
            nameFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
          documentOrLicense: documentFields.length > 0 ? 
            documentFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
          accessType: accessTypeField ? (tmeRecord[accessTypeField]?.toString() || '-') : '-',
          ticketType: ticketTypeField ? (tmeRecord[ticketTypeField]?.toString() || '-') : '-',
          dfdsStatus: 'No embarcado',
          tmeStatus: tmeRecord["STATUS"]?.toString() || 'Embarcado',
          source: 'tme'
        });
      }
    });

    // CASO 2: Tickets DFDS sin correspondencia en TME
    allDFDSRecords.forEach((dfdsRecord) => {
      const dfdsTicket = dfdsRecord["TICKET NUMBER"]?.toString() || '';
      if (!dfdsTicket.trim()) return;

      const matchingTMECoupon = tmeData.data.find(tmeRecord => {
        const tmeCoupon = tmeRecord[tmeCouponField]?.toString() || '';
        if (!tmeCoupon.trim()) return false;
        return tmeCoupon.includes(dfdsTicket) || dfdsTicket.includes(tmeCoupon);
      });

      if (matchingTMECoupon) {
        const tmeStatus = matchingTMECoupon["STATUS"]?.toString() || '';
        if (tmeStatus.toLowerCase() === 'cancelado') return;
      }

      if (!matchingTMECoupon) {
        const isVehicle = dfdsRecord["MAKE"] || dfdsRecord["MODEL"] || dfdsRecord["LICENSE PLATE"];
        
        incidences.push({
          ticketNumber: dfdsTicket,
          fullName: isVehicle 
            ? [dfdsRecord["MAKE"]?.toString(), dfdsRecord["MODEL"]?.toString()].filter(Boolean).join(' ') || dfdsRecord["DRIVER"]?.toString() || '-'
            : `${dfdsRecord["FIRST NAME"]?.toString() || ''} ${dfdsRecord["SURNAME"]?.toString() || ''}`.trim() || '-',
          documentOrLicense: isVehicle 
            ? dfdsRecord["LICENSE PLATE"]?.toString() || '-'
            : dfdsRecord["DOCUMENT ID"]?.toString() || '-',
          accessType: '-',
          ticketType: isVehicle ? 'Coche' : 'Pasajero',
          dfdsStatus: dfdsRecord["STATUS"]?.toString() || 'Embarcado',
          tmeStatus: 'No embarcado',
          source: 'dfds'
        });
      }
    });

    // CASO 3: Cancelados en TME
    tmeData.data.forEach((tmeRecord) => {
      const tmeStatus = tmeRecord["STATUS"]?.toString() || '';
      if (tmeStatus.toLowerCase() !== 'cancelado') return;
      
      const isDuplicated = tmeRecord["Duplicado"] !== undefined && tmeRecord["Duplicado"] !== null;
      if (isDuplicated) return;

      const tmeCoupon = tmeRecord[tmeCouponField]?.toString() || '';
      if (!tmeCoupon.trim()) return;

      const matchingDFDSRecord = allDFDSRecords.find(dfdsRecord => {
        const dfdsTicket = dfdsRecord["TICKET NUMBER"]?.toString() || '';
        if (!dfdsTicket.trim()) return false;
        return tmeCoupon.includes(dfdsTicket) || dfdsTicket.includes(tmeCoupon);
      });

      const nameFields = tmeData.headers.filter((header: string) => 
        header.toLowerCase().includes('nombre') || 
        header.toLowerCase().includes('apellido') ||
        header.toLowerCase().includes('name')
      );
      const documentFields = tmeData.headers.filter((header: string) => 
        header.toLowerCase().includes('documento') ||
        header.toLowerCase().includes('dni') ||
        header.toLowerCase().includes('pasaporte') ||
        header.toLowerCase().includes('document')
      );
      const accessTypeField = tmeData.headers.find((header: string) => 
        header.toLowerCase().includes('tipo acceso') || 
        header.toLowerCase().includes('acceso') || 
        header.toLowerCase().includes('access') || 
        header.toLowerCase().includes('categoria')
      );
      const ticketTypeField = tmeData.headers.find((header: string) => 
        header.toLowerCase().includes('tipo billete') || 
        header.toLowerCase().includes('billete') || 
        header.toLowerCase().includes('ticket') || 
        header.toLowerCase().includes('tarifa')
      );

      let dfdsStatus = 'No embarcado';
      let sourceType: 'tme' | 'both' = 'tme';

      if (matchingDFDSRecord) {
        dfdsStatus = matchingDFDSRecord["STATUS"]?.toString() || 'Embarcado';
        sourceType = 'both';
      }

      incidences.push({
        ticketNumber: tmeCoupon,
        fullName: nameFields.length > 0 ? 
          nameFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
        documentOrLicense: documentFields.length > 0 ? 
          documentFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
        accessType: accessTypeField ? (tmeRecord[accessTypeField]?.toString() || '-') : '-',
        ticketType: ticketTypeField ? (tmeRecord[ticketTypeField]?.toString() || '-') : '-',
        dfdsStatus: dfdsStatus,
        tmeStatus: 'Cancelado',
        source: sourceType
      });
    });

    // CASO 4: Duplicados en TME
    tmeData.data.forEach((tmeRecord) => {
      const isDuplicated = tmeRecord["Duplicado"] !== undefined && tmeRecord["Duplicado"] !== null;
      if (!isDuplicated) return;

      const tmeCoupon = tmeRecord[tmeCouponField]?.toString() || '';
      if (!tmeCoupon.trim()) return;

      const originalStatus = tmeRecord["STATUS"]?.toString() || 'Sin Estado';

      const matchingDFDSRecord = allDFDSRecords.find(dfdsRecord => {
        const dfdsTicket = dfdsRecord["TICKET NUMBER"]?.toString() || '';
        if (!dfdsTicket.trim()) return false;
        return tmeCoupon.includes(dfdsTicket) || dfdsTicket.includes(tmeCoupon);
      });

      const duplicateNumber = tmeRecord["Duplicado"]?.toString() || '1';
      // Mostrar siempre el ticket/cupón tal cual se detectó
      const displayTicketNumber = tmeCoupon;

      const nameFields = tmeData.headers.filter((header: string) => 
        header.toLowerCase().includes('nombre') || 
        header.toLowerCase().includes('apellido') ||
        header.toLowerCase().includes('name')
      );
      const documentFields = tmeData.headers.filter((header: string) => 
        header.toLowerCase().includes('documento') ||
        header.toLowerCase().includes('dni') ||
        header.toLowerCase().includes('pasaporte') ||
        header.toLowerCase().includes('document')
      );
      const accessTypeField = tmeData.headers.find((header: string) => 
        header.toLowerCase().includes('tipo acceso') || 
        header.toLowerCase().includes('acceso') || 
        header.toLowerCase().includes('access') || 
        header.toLowerCase().includes('categoria')
      );
      const ticketTypeField = tmeData.headers.find((header: string) => 
        header.toLowerCase().includes('tipo billete') || 
        header.toLowerCase().includes('billete') || 
        header.toLowerCase().includes('ticket') || 
        header.toLowerCase().includes('tarifa')
      );

      let dfdsStatus = 'No embarcado';
      let sourceType: 'tme' | 'both' = 'tme';

      if (matchingDFDSRecord) {
        dfdsStatus = matchingDFDSRecord["STATUS"]?.toString() || 'Embarcado';
        sourceType = 'both';
      }

      incidences.push({
        ticketNumber: displayTicketNumber,
        fullName: nameFields.length > 0 ? 
          nameFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
        documentOrLicense: documentFields.length > 0 ? 
          documentFields.map(field => tmeRecord[field]?.toString() || '').join(' ').trim() || '-' : '-',
        accessType: accessTypeField ? (tmeRecord[accessTypeField]?.toString() || '-') : '-',
        ticketType: ticketTypeField ? (tmeRecord[ticketTypeField]?.toString() || '-') : '-',
        dfdsStatus: dfdsStatus,
        tmeStatus: `Duplicado (${originalStatus})`,
        source: sourceType
      });
    });

    // Estadísticas
    const stats: ComparisonStats = {
      totalRecords: incidences.length,
      matchedRecords: incidences.filter(row => 
        row.source === 'both' && !row.tmeStatus.startsWith('Duplicado') && row.tmeStatus !== 'Cancelado'
      ).length,
      onlyInDFDS: incidences.filter(row => row.source === 'dfds').length,
      onlyInTME: incidences.filter(row => 
        row.source === 'tme' && !row.tmeStatus.startsWith('Duplicado')
      ).length,
      duplicates: incidences.filter(row => row.tmeStatus.startsWith('Duplicado')).length,
      incidences: incidences.length
    };

    return { incidences, stats };
  }
}

