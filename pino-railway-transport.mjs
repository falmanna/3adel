import { once } from "events";
import build from "pino-abstract-transport";
import SonicBoom from "sonic-boom";

const RAILWAY_LEVELS_MAP = {
	10: "debug", // trace
	20: "debug",
	30: "info",
	40: "warn",
	50: "error",
	60: "error", // fatal
};

export default async function (opts) {
	// SonicBoom is necessary to avoid loops with the main thread.
	// It is the same of pino.destination().
	const destination = new SonicBoom({ dest: opts.destination || 1, sync: false });
	await once(destination, "ready");

	return build(
		async function (source) {
			for await (let obj of source) {
				obj.level = RAILWAY_LEVELS_MAP[obj.level] || "info";

				const toDrain = !destination.write(JSON.stringify(obj) + "\n");
				// This block will handle backpressure
				if (toDrain) {
					await once(destination, "drain");
				}
			}
		},
		{
			async close(err) {
				destination.end();
				await once(destination, "close");
			},
		},
	);
}
