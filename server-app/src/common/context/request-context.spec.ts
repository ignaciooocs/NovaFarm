import {
  getSyncId,
  runWithRequestContext,
  sanitizeSyncId,
} from './request-context';

describe('request context', () => {
  describe('sanitizeSyncId', () => {
    it('accepts a short alphanumeric id', () => {
      expect(sanitizeSyncId('3f9c2a')).toEqual('3f9c2a');
      expect(sanitizeSyncId('sync_id-1')).toEqual('sync_id-1');
    });

    // El id llega por header, o sea que es texto del cliente que termina
    // escrito en el log: un salto de línea adentro dejaría escribir líneas
    // falsas y arruinaría justamente lo que este id existe para poder leer.
    it('drops anything that could forge a log line', () => {
      expect(sanitizeSyncId('3f9c2a\n[Sync] falso')).toBeUndefined();
      expect(sanitizeSyncId('con espacio')).toBeUndefined();
      expect(sanitizeSyncId('a'.repeat(33))).toBeUndefined();
      expect(sanitizeSyncId('')).toBeUndefined();
    });

    it('drops a header that is not a string', () => {
      expect(sanitizeSyncId(undefined)).toBeUndefined();
      expect(sanitizeSyncId(['3f9c2a', '000000'])).toBeUndefined();
    });
  });

  describe('runWithRequestContext', () => {
    it('keeps the sync id available across awaits, without passing it down', async () => {
      const seen = await runWithRequestContext({ syncId: '3f9c2a' }, () =>
        // Un await de por medio: es lo que hace cualquier service entre que
        // entra la petición y se loguea el resultado.
        Promise.resolve().then(() => getSyncId()),
      );

      expect(seen).toEqual('3f9c2a');
    });

    it('is undefined outside of any request', () => {
      expect(getSyncId()).toBeUndefined();
    });
  });
});
