import type {
	AssetsService as DAssetsService,
	FilesService as DFilesService,
	MailService as DMailService,
	PermissionsService,
} from "@directus/api/dist/services";

import type { HookExtensionContext } from "@directus/extensions";
import type { Accountability, ActionHandler, EventContext, Permission } from "@directus/types";
import { parseFilter, parsePreset } from "@directus/utils";
import type { JobsOptions, WorkerOptions } from "bullmq";

import type { CollectionName } from "../models";
import QueueManager from "./queue";
import type { RepositoryService } from "./types";

export async function constructRepository<C extends CollectionName>(
	context: HookExtensionContext,
	collectionName: C,
	accountability?: Accountability,
): Promise<RepositoryService<C>> {
	return new context.services.ItemsService(collectionName, {
		schema: await context.getSchema({ database: context.database }),
		knex: context.database,
		accountability: accountability,
	});
}

export type FilesService = DFilesService;

export async function constructFileService(
	context: HookExtensionContext,
	accountability?: Accountability,
): Promise<FilesService> {
	return new context.services.FilesService({
		schema: await context.getSchema({ database: context.database }),
		knex: context.database,
		accountability: accountability,
	});
}

export type AssetsService = DAssetsService;

export async function constructAssetsService(context: HookExtensionContext): Promise<AssetsService> {
	return new context.services.AssetsService({
		schema: await context.getSchema({ database: context.database }),
		knex: context.database,
	});
}

export async function getUserPermissions(
	context: HookExtensionContext,
	accountability: Accountability,
): Promise<Permission[]> {
	const userRepo = await constructRepository(context, "directus_users");
	const user = await userRepo.readOne(accountability.user!);
	const roleRepo = await constructRepository(context, "directus_roles");

	let permissions: Permission[] = [];
	for (const role of accountability.roles) {
		const userRole = await roleRepo.readOne(role, { fields: ["*", "policies.*"] });
		const policies = userRole.policies?.map((policy) => policy.policy as string) || [];

		const permissionsService: PermissionsService = new context.services.PermissionsService({
			schema: await context.getSchema({ database: context.database }),
			knex: context.database,
		});
		permissions = permissions.concat(
			(await permissionsService.readByQuery({
				filter: { policy: { _in: policies } },
			})) as Permission[],
		);
	}

	return permissions.map((permission) => {
		const filterContext = {
			$CURRENT_USER: user as any,
			$CURRENT_ROLE: accountability.role as any,
		};
		permission.permissions = parseFilter(permission.permissions, accountability, filterContext);
		permission.validation = parseFilter(permission.validation, accountability, filterContext);
		permission.presets = parsePreset(permission.presets, accountability, filterContext);

		return permission;
	});
}

export async function constructNotificationService(context: HookExtensionContext, accountability: any = null) {
	return await constructRepository(context, "directus_notifications", accountability);
}

export type MailService = DMailService;

export async function constructMailService(
	context: HookExtensionContext,
	accountability: any = null,
): Promise<MailService> {
	return new context.services.MailService({
		schema: await context.getSchema({ database: context.database }),
		knex: context.database,
		accountability: accountability,
	});
}

/**
 * Registers an action handler that queues jobs for processing.
 *
 * @template T - The type of the job data. Defaults to an object containing `meta` and `context`.
 *
 * @param action - The function to register the action handler.
 * @param ext - The extension context, providing access to logger, environment variables, etc.
 * @param optsGenerator - An optional function that generates job data and options based on the action's meta and context.
 *
 * @returns A function that registers the action handler for the specified event.
 *
 * @example
 * queuedAction(action, ext, (meta, context) => [
 *   { data: { meta, context, key: 'example' }, opts: { delay: 1000 } }
 * ])('example.event', async (jobData) => {
 *   // Process the job data
 * });
 */
export function queuedAction<
	T = {
		meta: Record<string, any>;
		context: EventContext;
	},
>(
	queueName: string,
	action: (event: string, handler: ActionHandler) => void,
	ext: HookExtensionContext,
	optsGenerator?: (meta: Record<string, any>, context: EventContext) => { data: T; opts?: JobsOptions }[],
	workerOpts?: Partial<WorkerOptions>,
) {
	return (event: string, actionHandler: (jobData: T) => Promise<void>) => {
		const queuedActionHandler: ActionHandler = async (meta, context) => {
			const queue = QueueManager.getInstance(ext).getQueue(queueName);
			const jobs = optsGenerator ? optsGenerator(meta, context) : [{ data: { meta, context }, opts: undefined }];

			for (const job of jobs) {
				await queue.add(queueName, job.data, job.opts);
			}
		};

		QueueManager.getInstance(ext).initializeWorker<T, void>(
			queueName,
			async (job) => {
				await actionHandler(job.data);
			},
			workerOpts,
		);

		action(event, queuedActionHandler);
	};
}
