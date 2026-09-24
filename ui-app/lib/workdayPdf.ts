import * as Print from 'expo-print';
import { strings } from '@/constants/strings';
import { formatCLP, formatKg } from '@/lib/format';
import { computePay, hasPay, sumPay, type WorkdayPay } from '@/lib/pay';
import type { WeighingSummary } from '@/lib/weighing';

export interface WorkdayPdfRosterRow {
  workdayNumber: number;
  name: string;
  unitCount: number;
  totalKg: number;
}

// Resumen del pesaje de control del día, o null si nadie pesó nada — en ese
// caso el PDF no lo menciona (ver lib/weighing.ts).
export type WorkdayPdfWeighing = WeighingSummary | null;

// `pay` viene de la jornada misma. Si no tiene tarifa, el PDF no habla de
// plata en absoluto: ni columna, ni total — no una columna con ceros.
export interface WorkdayPdfData extends WorkdayPay {
  productName: string;
  productIcon: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  recorderName?: string;
  totalKg: number;
  roster: WorkdayPdfRosterRow[];
  weighing: WorkdayPdfWeighing;
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

  const showPay = hasPay(data);
  const totalPay = sumPay(data, data.roster);

  const rosterRows = data.roster
    .map((row) => {
      const pay = computePay(data, row);
      return `
        <tr>
          <td>${row.workdayNumber}</td>
          <td>${escapeHtml(row.name)}</td>
          <td class="num">${row.unitCount}</td>
          <td class="num">${formatKg(row.totalKg)}</td>
          ${showPay ? `<td class="num pay">${formatCLP(pay ?? 0)}</td>` : ''}
        </tr>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, Roboto, sans-serif; color: #1A1A1A; padding: 8px; }
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
          td.pay { font-weight: 700; }
          .payTotal { font-size: 20px; font-weight: 700; margin-top: 8px; }
          .payLabel { color: #5C5C5C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .weighing { margin-bottom: 24px; font-size: 13px; }
          .weighingNote { color: #5C5C5C; font-size: 11px; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="brand">${strings.auth.brand.toUpperCase()}</div>
        <h1>${data.productIcon} ${escapeHtml(data.productName)}</h1>
        <div class="subtitle">${metaLine}</div>
        <div class="totalBox">
          <div class="totalLabel">${totalLabel}</div>
          <div class="totalValue">${formatKg(data.totalKg)} ${strings.anotador.kg}</div>
          ${
            showPay
              ? `<div class="payLabel">${strings.pay.totalToPay}</div>
                 <div class="payTotal">${formatCLP(totalPay ?? 0)}</div>`
              : ''
          }
        </div>
        ${
          data.weighing
            ? `<div class="weighing">
                 <div class="payLabel">${strings.weighing.controlTitle}</div>
                 <div>${strings.weighing.roundsSummary(data.weighing.weighedRounds, data.weighing.totalRounds)} · ${strings.weighing.comparison(formatKg(data.weighing.measuredKg), formatKg(data.weighing.expectedKg))} (${strings.weighing.difference(formatKg(data.weighing.differenceKg), data.weighing.differenceKg > 0)})</div>
                 <div class="weighingNote">${strings.weighing.doesNotAffect}</div>
               </div>`
            : ''
        }
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${strings.history.pdfHarvesterColumn}</th>
              <th class="num">${strings.history.pdfCountColumn}</th>
              <th class="num">${strings.history.pdfKgColumn}</th>
              ${showPay ? `<th class="num">${strings.history.pdfPayColumn}</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${
              rosterRows ||
              `<tr><td colspan="${showPay ? 5 : 4}">${strings.history.pdfEmptyRoster}</td></tr>`
            }
          </tbody>
        </table>
      </body>
    </html>
  `;
}

// Primer intento (2026-09-04): `Print.printAsync({ html })` directo — pero
// en iOS ese diálogo abre de entrada en la pantalla de Opciones (impresora/
// copias/tamaño), con el documento real tapado atrás, apenas visible.
// Confirmado con una captura del usuario: no sirve como vista previa, es un
// flujo de impresión, no de "mirar el PDF" (que era el pedido). Ahora esta
// función solo genera el archivo — la pantalla que la llama lo muestra en
// un WebView propio (visor real, de entrada) y deja imprimir/compartir como
// una acción aparte, no lo primero que se ve.
export async function generateWorkdaySummaryPdf(
  data: WorkdayPdfData,
): Promise<string> {
  const html = buildHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
