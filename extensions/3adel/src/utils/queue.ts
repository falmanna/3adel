import type { HookExtensionContext } from "@directus/extensions";
import * as Sentry from "@sentry/node";
import { DefaultJobOptions, Job, Queue, Worker, WorkerOptions } from "bullmq";
import Redis from "ioredis";
import type { Knex } from "knex";

import { ActionEventParams, DirectusEmitter } from "./types";

export class InterruptedException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InterruptedException";
	}
}

export type QueueTransactionContext = {
	isInterrupted: () => boolean; // TODO: change to raiseOnInterrupt to prevent unnecessary conditional checks everywhere
	bypassEmitAction: (params: ActionEventParams) => void;
	transaction: Knex.Transaction;
};

class QueueManager {
	private static instance: QueueManager;
	private workers: { [key: string]: Worker<any, any> } = {};
	private logger: HookExtensionContext["logger"];
	private env: HookExtensionContext["env"];
	private db: HookExtensionContext["database"];
	private emitter: DirectusEmitter;

	private constructor(ext_context: HookExtensionContext) {
		this.logger = ext_context.logger;
		this.env = ext_context.env;
		this.db = ext_context.database;
		this.emitter = ext_context.emitter;
	}

	public static getInstance(ext_context: HookExtensionContext): QueueManager {
		if (!QueueManager.instance) {
			QueueManager.instance = new QueueManager(ext_context);
		}
		return QueueManager.instance;
	}

	public getQueue<T>(name: string, jobOptions?: DefaultJobOptions) {
		const defaultJobOptions = jobOptions ?? {
			removeOnComplete: this.env.JOB_REMOVE_ON_COMPLETE || 100,
			removeOnFail: this.env.JOB_REMOVE_ON_FAIL || 100,
			attempts: this.env.JOB_ATTEMPTS || 10,
			backoff: { type: "exponential", delay: this.env.JOB_BACKOFF_DELAY || 1000 },
		};
		return new Queue<Job<T>>(name, {
			connection: new Redis(this.env.REDIS, { maxRetriesPerRequest: null }),
			defaultJobOptions,
		});
	}

	public initializeWorker<T, R>(
		queueName: string,
		processFunction: (job: Job<T>, db: Knex) => Promise<R>,
		options?: Partial<WorkerOptions>,
	): Worker<T, R> {
		if (this.workers[queueName]) {
			return this.workers[queueName];
		}

		const worker = this.createWorker(queueName, (job: Job<T>) => processFunction(job, this.db), options);

		return this.setupWorker(queueName, worker);
	}

	public initializeTransactionalWorker<T, R>(
		queueName: string,
		processFunction: (job: Job<T>, queueTransactionContext: QueueTransactionContext) => Promise<R>,
		options?: Partial<WorkerOptions>,
	): Worker<T, R> {
		if (this.workers[queueName]) {
			return this.workers[queueName];
		}

		const worker = this.createWorker(
			queueName,
			async (job: Job<T>) => {
				let interrupted = false;

				// Define the cancellation handler
				const cancelHandler = (meta: Record<string, any>) => {
					if (meta.key === job.id) {
						interrupted = true;
					}
				};

				// Register the cancellation handler
				this.emitter.onAction("bullmq.cancel-job", cancelHandler);

				try {
					const isInterrupted = () => interrupted;

					// Start the transaction
					const queuedEvents: ActionEventParams[] = [];

					const bypassEmitAction = (params: ActionEventParams) => {
						queuedEvents.push(params);
					};
					const result = await this.db.transaction((transaction) =>
						processFunction(job, {
							transaction,
							isInterrupted,
							bypassEmitAction,
						}),
					);

					// emit buffered events in order
					for (const event of queuedEvents) {
						this.emitter.emitAction(event.event, event.meta, event.context);
					}
					return result;
				} finally {
					// Clean up the event listener
					this.emitter.offAction("bullmq.cancel-job", cancelHandler);
				}
			},
			options,
		);

		return this.setupWorker(queueName, worker);
	}

	private createWorker<T, R>(
		queueName: string,
		processFunction: (job: Job<T>) => Promise<R>,
		options?: Partial<WorkerOptions>,
	): Worker<T, R> {
		return new Worker<T, R>(queueName, processFunction, {
			connection: new Redis(this.env.REDIS, { maxRetriesPerRequest: null }),
			autorun: false,
			...options,
		});
	}

	private setupWorker<T, R>(queueName: string, worker: Worker<T, R>): Worker<T, R> {
		worker.on("failed", (job, err) => {
			// Only report error if this was the last retry attempt
			const maxAttempts = job?.opts?.attempts ?? 1;
			const attemptsMade = job?.attemptsMade ?? 0;
			if (attemptsMade < maxAttempts) {
				this.logger.warn(
					`Worker for queue ${queueName} and job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts})`,
				);
				return;
			}

			if (this.env.SENTRY_DSN) {
				Sentry.withScope((scope) => {
					scope.setContext("job", {
						id: job?.id,
						name: job?.name,
						queue: queueName,
						data: job?.data && typeof job.data === "object" && "meta" in job.data ? job.data.meta : job?.data,
					});
					scope.setTags({
						queue: queueName,
						jobName: job?.name,
					});
					Sentry.captureException(err);
				});
			}

			if (err instanceof InterruptedException) {
				this.logger.warn(`Worker for queue ${queueName} and job ${job?.id} was interrupted`);
			} else {
				this.logger.error(err, `Worker for queue ${queueName} and job ${job?.id} failed: ${err.message}`);
			}
		});

		this.workers[queueName] = worker;
		return worker;
	}

	public async shutdownWorker(queueName: string): Promise<void> {
		const worker = this.workers[queueName];
		if (worker) {
			await worker.close();
		}
		delete this.workers[queueName];
	}

	public async activateAllWorkers(): Promise<void> {
		await Promise.all(
			Object.values(this.workers).map((worker) => {
				this.logger.debug(`Starting worker ${worker.name}`);
				return worker.run();
			}),
		);
	}

	public async shutdownAllWorkers(): Promise<void> {
		await Promise.all(
			Object.values(this.workers).map((worker) => {
				this.logger.debug(`Stopping worker ${worker.name}`);
				return worker.close();
			}),
		);
	}

	public cancelJob(jobId: string) {
		this.emitter.emitAction("bullmq.cancel-job", { key: jobId });
	}

	private async waitForJobInterruption(job: Job): Promise<void> {
		while (true) {
			const state = await job.getState();
			if (state !== "active") {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	public async requeueDuplicatedJob<T>(
		queue: Queue,
		jobName: string,
		jobData: T,
		options: { deduplication: { id: string } },
	): Promise<Job<T>> {
		const jobId = await queue.getDeduplicationJobId(options.deduplication.id);
		const existingJob = jobId ? await queue.getJob(jobId) : null;

		if (existingJob) {
			const jobState = await existingJob.getState();
			if (jobState !== "active") {
				await existingJob.remove();
				this.logger.debug(`Removed queued job ${existingJob.id}, queuing new job`);
			} else {
				this.cancelJob(existingJob.id!);
				await this.waitForJobInterruption(existingJob);
				this.logger.debug(`Job ${existingJob.id} was interrupted, proceeding with new job`);
			}
		}

		return await queue.add(jobName, jobData, options);
	}
}

export default QueueManager;
