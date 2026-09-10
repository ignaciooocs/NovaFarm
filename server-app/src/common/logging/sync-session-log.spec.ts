import { Logger } from '@nestjs/common';
import { noteSyncBatch, noteSyncRequest } from './sync-session-log';

describe('sync session log', () => {
  let lines: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    lines = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        lines.push(String(message));
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens the block once per sync and closes it with the accumulated totals', () => {
    noteSyncRequest('abc123');
    noteSyncBatch('abc123', 100, 0);
    noteSyncRequest('abc123');
    noteSyncBatch('abc123', 98, 2);

    // Una sola línea de apertura, aunque la corrida traiga varias peticiones.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('sync abc123 · INICIO');

    jest.advanceTimersByTime(20_000);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('sync abc123 · FIN');
    expect(lines[1]).toContain('2 peticiones');
    expect(lines[1]).toContain('198 filas');
    expect(lines[1]).toContain('2 rechazos');
  });

  it('says "sin rechazos" when the whole sync went through', () => {
    noteSyncRequest('ok0001');
    noteSyncBatch('ok0001', 12, 0);

    jest.advanceTimersByTime(20_000);

    expect(lines[1]).toContain('sin rechazos');
  });

  // Dos anotadores sincronizando a la vez: cada corrida abre y cierra su
  // propio bloque, y como cada línea lleva su `sync=<id>`, que se intercalen
  // no rompe la lectura.
  it('tracks two simultaneous syncs as separate blocks', () => {
    noteSyncRequest('aaa111');
    noteSyncRequest('bbb222');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('aaa111');
    expect(lines[1]).toContain('bbb222');

    jest.advanceTimersByTime(20_000);

    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain('aaa111');
    expect(lines[3]).toContain('bbb222');
  });

  // El contador solo suma a una corrida abierta: un lote que llega después
  // del cierre (o sin corrida) no revive el bloque ni inventa totales.
  it('ignores batch totals for a sync that is not open', () => {
    noteSyncBatch('nunca-abierto', 50, 0);

    expect(lines).toHaveLength(0);
  });
});
