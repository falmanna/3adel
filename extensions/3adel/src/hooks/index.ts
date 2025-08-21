import { defineHook } from "@directus/extensions";
import * as Sentry from "@sentry/node";

import QueueManager from "../utils/queue";
import { advancedSearch } from "./search";

export default defineHook(({ filter, action, init, embed }, ext) => {
	filter("items.query", async (payload, meta, context) => {
		return advancedSearch(payload as any, meta, context, ext);
	});

	// SYSTEM TRIGGERS ========================================

	if (ext.env.SENTRY_DSN) {
		init("routes.custom.after", ({ app }) => {
			Sentry.setupExpressErrorHandler(app);
			ext.logger.debug("-- Sentry ExpressErrorHandler Added --");
		});
	}

	if (ext.env.SENTRY_CLIENT_SRC) {
		embed(
			"head",
			() => `<script>
			window.Sentry &&
  			Sentry.onLoad(function () {
				Sentry.init({
					integrations: [
						Sentry.replayIntegration(),
					],
					replaysSessionSampleRate: 0,
					replaysOnErrorSampleRate: 1.0,
					beforeSend: function(event) {
						// Check if error is from an HTTP 400 response
						if (event.exception && 
							event.exception.values && 
							event.exception.values[0] && 
							event.exception.values[0].type === 'Error' &&
							event.exception.values[0].value && 
							event.exception.values[0].value.includes('400')) {
							return null; // Drop the event
						}
						return event; // Keep other events
					}
				});
			});
			</script>`
		);

		embed(
			"head",
			`<script src="${ext.env.SENTRY_CLIENT_SRC}" crossorigin="anonymous"></script>`
		);
	}

	action("server.start", async () => {
		ext.logger.info("Server start");
		await QueueManager.getInstance(ext).activateAllWorkers();
	});

	action("server.stop", async () => {
		ext.logger.info("Server stop");
		await QueueManager.getInstance(ext).shutdownAllWorkers();
	});

	action("extensions.reload", async () => {
		ext.logger.info("Extensions reload");
		await QueueManager.getInstance(ext).shutdownAllWorkers();
		await QueueManager.getInstance(ext).activateAllWorkers();
	});


	// embed(
	// 	"head",
	// 	() => `<style>
	// 		#sidebar.is-open {
	// 			flex-basis: 500px !important;
	// 		}

	// 		#sidebar.is-open .flex-container {
	// 			width: 100% !important;
	// 		}
	// 	</style>`,
	// );
});
