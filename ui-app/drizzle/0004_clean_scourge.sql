PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_measurement_units` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text DEFAULT 'COUNT' NOT NULL,
	`kg_factor` real,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_measurement_units`("id", "farm_id", "name", "mode", "kg_factor", "active") SELECT "id", "farm_id", "name", CASE WHEN "kg_factor" = 1 THEN 'WEIGHT' ELSE 'COUNT' END, CASE WHEN "kg_factor" = 1 THEN NULL ELSE "kg_factor" END, "active" FROM `measurement_units`;--> statement-breakpoint
DROP TABLE `measurement_units`;--> statement-breakpoint
ALTER TABLE `__new_measurement_units` RENAME TO `measurement_units`;--> statement-breakpoint
UPDATE `harvest_entries` SET `unit_count` = CASE WHEN `unit_count` < 0 THEN -1 ELSE 1 END WHERE `measurement_unit_id` IN (SELECT `id` FROM `measurement_units` WHERE `mode` = 'WEIGHT') AND `unit_count` NOT IN (1, -1);--> statement-breakpoint
PRAGMA foreign_keys=ON;
