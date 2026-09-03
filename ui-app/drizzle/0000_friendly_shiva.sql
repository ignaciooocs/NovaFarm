CREATE TABLE `fruits` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harvest_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workday_id` text NOT NULL,
	`harvester_id` text NOT NULL,
	`measurement_unit_id` text NOT NULL,
	`unit_count` real NOT NULL,
	`total_kg` real NOT NULL,
	`recorded_at` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harvester_workday` (
	`id` text PRIMARY KEY NOT NULL,
	`workday_id` text NOT NULL,
	`harvester_id` text NOT NULL,
	`workday_number` integer NOT NULL,
	`added_at` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harvesters` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nickname` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `measurement_units` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`kg_factor` real NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workdays` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`farm_id` text NOT NULL,
	`date` text NOT NULL,
	`fruit_id` text NOT NULL,
	`default_measurement_unit_id` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`final_total_kg` real,
	`synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
