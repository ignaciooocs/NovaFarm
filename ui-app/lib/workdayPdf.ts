import * as Print from 'expo-print';
import { strings } from '@/constants/strings';

export interface WorkdayPdfRosterRow {
  workdayNumber: number;
  name: string;
  unitCount: number;
  totalKg: number;
}

export interface WorkdayPdfData {
  fruitName: string;
  fruitIcon: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  recorderName?: string;
  totalKg: number;
  roster: WorkdayPdfRosterRow[];
}

// El HTML lo renderiza el motor nativo de impresión (WKWebView/Chromium
// headless según la plataforma) para armar el PDF — no hay forma de inyectar
// código ahí, pero el nombre del cosechador/fruta sí es texto libre (RNF:
// nunca hardcodeado), así que igual se escapa por prolijidad.
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(data: WorkdayPdfData): string {
  const dateLabel = new Date(data.date).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const metaLine = [
    dateLabel,
    data.recorderName ? strings.history.recordedBy(data.recorderName) : null,
    data.status === 'OPEN' ? strings.history.openLabel : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const totalLabel =
    data.status === 'OPEN' ? strings.history.syncedSoFar : strings.workday.totalKg;

  const rosterRows = data.roster
    .map(
      (row) => `
        <tr>
          <td>${row.workdayNumber}</td>
          <td>${escapeHtml(row.name)}</td>
          <td class="num">${row.unitCount}</td>
          <td class="num">${row.totalKg.toFixed(2)}</td>
        </tr>`,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; color: #1A1A1A; padding: 32px; }
          .brand { color: #16A34A; font-weight: 700; font-size: 12px; letter-spacing: 1px; margin-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .subtitle { color: #5C5C5C; margin-bottom: 20px; text-transform: capitalize; }
          .totalBox { background: #FAFAFA; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
          .totalLabel { color: #5C5C5C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .totalValue { font-size: 32px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 8px; border-bottom: 1px solid #D9D9D9; font-size: 13px; }
          th { color: #5C5C5C; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
          td.num, th.num { text-align: right; }
        </style>
      </head>
      <body>
        <div class="brand">${strings.auth.brand.toUpperCase()}</div>
        <h1>${data.fruitIcon} ${escapeHtml(data.fruitName)}</h1>
        <div class="subtitle">${metaLine}</div>
        <div class="totalBox">
          <div class="totalLabel">${totalLabel}</div>
          <div class="totalValue">${data.totalKg.toFixed(2)} ${strings.anotador.kg}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${strings.history.pdfHarvesterColumn}</th>
              <th class="num">${strings.history.pdfCountColumn}</th>
              <th class="num">${strings.history.pdfKgColumn}</th>
            </tr>
          </thead>
          <tbody>
            ${rosterRows || `<tr><td colspan="4">${strings.history.pdfEmptyRoster}</td></tr>`}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

// Antes generaba el PDF y abría el share sheet directo, sin mostrarlo — el
// usuario pidió poder verlo primero. `Print.printAsync({ html })` abre el
// diálogo nativo de impresión (AirPrint en iOS, el Print Framework en
// Android), que ya renderiza una vista previa real del documento antes de
// imprimir — sin esto no hace falta un dev client ni una librería de visor
// de PDF (react-native-webview no garantiza un render de PDF confiable en
// Android, es un punto débil conocido de esa librería). "Guardar como PDF"
// desde ese mismo diálogo (ambas plataformas lo ofrecen como destino de
// impresión) cubre el caso de querer conservar/compartir el archivo
// después, sin un botón de compartir aparte por ahora.
export async function previewWorkdaySummaryPdf(
  data: WorkdayPdfData,
): Promise<void> {
  const html = buildHtml(data);
  await Print.printAsync({ html });
}
