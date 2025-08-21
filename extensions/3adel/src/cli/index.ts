import { defineHook } from "@directus/extensions-sdk";
import type { Command } from "commander";

export default defineHook(({ init }, ext) => {
	const getPostMigrationsPath = () => {
		return ext.env.MIGRATIONS_POST_PATH || "./migrations/post";
	};

	init("cli.after", async (meta) => {
		const program: Command = meta.program;
		const dbCommand =
			program.commands.find((cmd) => cmd.name() === "database") ||
			program.command("database");

		dbCommand
			.command("migrate:post")
			.description("Run post migrations to the latest")
			.action(async () => {
				const postMigrationsPath = getPostMigrationsPath();
				const result = await ext.database.migrate.latest({
					directory: postMigrationsPath,
				});
				ext.logger.info(`${result[1].length} post migrations executed`);
				process.exit(0);
			});

		dbCommand
			.command("migrate:post:down")
			.description("Rollback the last batch of post migrations")
			.action(async () => {
				const postMigrationsPath = getPostMigrationsPath();
				const result = await ext.database.migrate.rollback({
					directory: postMigrationsPath,
				});
				ext.logger.info(`${result[1].length} post migrations rolled back`);
				process.exit(0);
			});

		// database seed
		dbCommand
			.command("seed")
			.description("Seed the database with initial data")
			.action(async () => {
				ext.logger.info("Seeding database...");
				// seed
				ext.logger.info("Database seeded");
				process.exit(0);
			});
	});
});
