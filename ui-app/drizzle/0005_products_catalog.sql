-- Custom SQL migration file, put your code below! --

-- `fruits` (el catálogo por farm) pasa a `products`, la caché de los
-- cultivos que esta farm cosecha, cuyos ids ahora son globales — la misma
-- "Palta" para todas las farms (ver product.schema.ts en server-app).
--
-- Se dropea y se recrea en vez de renombrarse a propósito: es caché de solo
-- lectura y los ids VIEJOS no sirven, porque apuntaban a la fila que esta
-- farm tenía para sí. El próximo syncCatalogs() la vuelve a llenar con los
-- ids globales.
DROP TABLE `fruits`;--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
-- La jornada apunta al cultivo, no a la fruta vieja. Se renombra (no se
-- dropea) para no borrar una jornada que todavía no se sincronizó.
--
-- OJO: el VALOR que queda adentro es el id de la fruta vieja, que ya no
-- existe en el server. Una jornada abierta antes de esta migración y sin
-- sincronizar no va a poder subir — hay que cerrarla o descartarla. No se
-- puede arreglar desde acá: el mapeo viejo->nuevo solo lo conoce el server
-- (ver scripts/migrate-fruits-to-products.ts), y la columna es NOT NULL.
ALTER TABLE `workdays` RENAME COLUMN `fruit_id` TO `product_id`;
