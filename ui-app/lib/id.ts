// Genera un id local razonablemente único (timestamp + random) para las
// filas que esta app crea offline. No es un UUID criptográfico, pero
// alcanza para unicidad dentro de un mismo dispositivo — que es todo lo que
// se necesita (ver clientEntryId en harvesterWorkday/harvestEntries).
export function generateLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
