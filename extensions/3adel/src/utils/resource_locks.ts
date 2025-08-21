import { Knex } from "knex";

export type LockCallback = () => Promise<void>;

/**
 * General locking utility
 * @param db - The Knex instance
 * @param resourceId - The resource ID to lock
 * @param callback - The callback function to execute while the resource is locked
 */
export async function withResourceLock(db: Knex, resourceId: string, callback: LockCallback): Promise<void> {
	try {
		await db.transaction(async (trx) => {
			// Attempt to lock the row if it exists
			const existingRow = await trx("resource_lock").where("id", resourceId).forUpdate().select("id").first();

			// Insert the row if it doesn't exist
			if (!existingRow) {
				await trx.raw(
					`
          INSERT INTO resource_lock (id)
          VALUES (?)
          ON CONFLICT (id) DO NOTHING
          `,
					[resourceId],
				);

				// Lock the row if it was inserted
				await trx("resource_lock").where("id", resourceId).forUpdate().select("id").first();
			}

			// Execute the callback function while the resource is locked
			await callback();

			// Commit the transaction
			await trx.commit();
		});
	} catch (error) {
		console.error("An error occurred:", error);
		// Rollback the transaction if an error occurs
		throw error;
	}
}
