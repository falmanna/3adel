import type { Accountability, ActionEventParams, ActionHandler, EventContext, ExtensionsServices, FilterHandler, InitHandler, MutationOptions, PrimaryKey, Query, QueryOptions } from "@directus/types";
import { Request } from "express";

import { CollectionName, Collections, ItemIn } from "../models";

export { ActionEventParams };

type ItemsService<T> = ExtensionsServices["ItemsService"];

type PickNullable<T> = {
	[P in keyof T as null extends T[P] ? P : never]: T[P];
};

type PickNotNullable<T> = {
	[P in keyof T as null extends T[P] ? never : P]: T[P];
};

export type OptionalNullable<T> = T extends any[]
	? Array<OptionalNullable<T[0]>>
	: T extends object
		? {
				[K in keyof PickNullable<T>]?: OptionalNullable<Exclude<T[K], null>>;
			} & {
				[K in keyof PickNotNullable<T>]: OptionalNullable<T[K]>;
			}
		: T;

export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export type ArrayCollectionName = Exclude<CollectionName, "directus_settings">;

export type ArrayItemIn<CollectionKey extends ArrayCollectionName> =
	Collections[CollectionKey] extends (infer Item extends Record<string, any>)[] ? Item : Collections[CollectionKey];

export type DRequest = Request & { accountability?: Accountability };

export function isRecord(value: any): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isArray(value: any): value is any[] {
	return Array.isArray(value);
}

// copied and adapted from @directus source code
export declare class DirectusEmitter {
    private filterEmitter;
    private actionEmitter;
    private initEmitter;
    constructor();
    private getDefaultContext;
    emitFilter<T>(event: string | string[], payload: T, meta: Record<string, any>, context?: EventContext | null): Promise<T>;
    emitAction(event: string | string[], meta: Record<string, any>, context?: EventContext | null): void;
    emitInit(event: string, meta: Record<string, any>): Promise<void>;
    onFilter<T = unknown>(event: string, handler: FilterHandler<T>): void;
    onAction(event: string, handler: ActionHandler): void;
    onInit(event: string, handler: InitHandler): void;
    offFilter<T = unknown>(event: string, handler: FilterHandler<T>): void;
    offAction(event: string, handler: ActionHandler): void;
    offInit(event: string, handler: InitHandler): void;
    offAll(): void;
}

type IsExpanded<T extends string> = T extends `${infer _}.${infer _}` ? true : false;
type BaseFieldName<T extends string> = T extends `${infer Base}.${infer _}` ? Base : T;
type HasWildcard<Fields> = Fields extends readonly string[] ? ("*" extends Fields[number] ? true : false) : false;
type IsArray<T> = T extends any[] ? true : false;
type ArrayElement<T> = T extends (infer U)[] ? U : never;
type GetIdType<T> = T extends { id: infer ID } ? ID : never;

// Field type extraction with proper handling of expanded fields
type ExtractFieldType<Model, Field extends string, K extends keyof Model = BaseFieldName<Field> & keyof Model> =
	IsExpanded<Field> extends true
		? Exclude<Model[K], string | number | boolean | symbol | bigint | undefined>
		: Field extends keyof Model
			? IsArray<Exclude<Model[K], null>> extends true
				? GetIdType<ArrayElement<Exclude<Model[K], null>>>[] | (null extends Model[K] ? null : never)
				: Extract<Model[K], string | number | boolean | null>
			: never;

// Helper to get valid field keys
type ValidKeys<Model> = keyof Model extends string ? keyof Model : never;

// Handle expanded fields in queries
type ExpandedFields<Fields extends readonly string[]> = {
	[K in Fields[number]]: IsExpanded<K> extends true ? K : never;
}[Fields[number]];

type BaseFieldsWithExpansions<Fields extends readonly string[]> = {
	[K in ExpandedFields<Fields>]: BaseFieldName<K>;
}[ExpandedFields<Fields>];

// Top level fields handling with proper exclusion of expanded fields
type TopLevelFields<Model, Fields extends readonly string[]> = {
	[K in Exclude<ValidKeys<Model>, BaseFieldsWithExpansions<Fields>>]: ExtractFieldType<Model, K & string>;
};

// Main type inference system
export type InferredType<C extends CollectionName, Fields extends readonly string[]> =
	HasWildcard<Fields> extends true
		? TopLevelFields<ItemIn<C>, Fields> & {
				[Field in ExpandedFields<Fields> as BaseFieldName<Field>]: ExtractFieldType<ItemIn<C>, Field>;
			}
		: {
				[Field in Fields[number] as BaseFieldName<Field>]: ExtractFieldType<ItemIn<C>, Field>;
			};

// Add a default fields type for when no fields are specified
type DefaultFields = ["*"];

export type RepositoryService<C extends CollectionName> = Omit<
	ItemsService<ItemIn<C>>,
	| "readOne"
	| "readMany"
	| "readByQuery"
	| "readSingleton"
	| "getKeysByQuery"
	| "createOne"
	| "createMany"
	| "updateByQuery"
	| "updateOne"
	| "updateBatch"
	| "updateMany"
	| "upsertOne"
	| "upsertMany"
	| "upsertSingleton"
> & {
	readOne<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		key: PrimaryKey,
		query?: { fields?: [...Fields] } & Omit<Query, "fields">,
		opts?: QueryOptions,
	): Promise<InferredType<C, Fields>>;

	readMany<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		keys: PrimaryKey[],
		query?: { fields?: [...Fields] } & Omit<Query, "fields">,
		opts?: QueryOptions,
	): Promise<InferredType<C, Fields>[]>;

	readByQuery<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		query?: { fields?: [...Fields] } & Omit<Query, "fields">,
		opts?: QueryOptions,
	): Promise<InferredType<C, Fields>[]>;

	readSingleton<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		query?: { fields?: [...Fields] } & Omit<Query, "fields">,
		opts?: QueryOptions,
	): Promise<Partial<InferredType<C, Fields>>>;

	getKeysByQuery<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		query?: { fields?: [...Fields] } & Omit<Query, "fields">,
	): Promise<PrimaryKey[]>;

	createOne(data: DeepPartial<ItemIn<C>>, opts?: MutationOptions): Promise<PrimaryKey>;

	createMany(data: DeepPartial<ItemIn<C>>[], opts?: MutationOptions): Promise<PrimaryKey[]>;

	updateByQuery<
		Fields extends ((string & keyof ItemIn<C>) | `${string & keyof ItemIn<C>}.${string}` | "*")[] = DefaultFields,
	>(
		query: { fields?: [...Fields] } & Omit<Query, "fields">,
		data: DeepPartial<ItemIn<C>>,
		opts?: MutationOptions,
	): Promise<PrimaryKey[]>;

	updateOne(key: PrimaryKey, data: DeepPartial<ItemIn<C>>, opts?: MutationOptions): Promise<PrimaryKey>;

	updateBatch(data: DeepPartial<ItemIn<C>>[], opts?: MutationOptions): Promise<PrimaryKey[]>;

	updateMany(keys: PrimaryKey[], data: DeepPartial<ItemIn<C>>, opts?: MutationOptions): Promise<PrimaryKey[]>;

	upsertOne(payload: DeepPartial<ItemIn<C>>, opts?: MutationOptions): Promise<PrimaryKey>;

	upsertMany(payloads: DeepPartial<ItemIn<C>>[], opts?: MutationOptions): Promise<PrimaryKey[]>;

	upsertSingleton(data: DeepPartial<ItemIn<C>>, opts?: MutationOptions): Promise<PrimaryKey>;
};
