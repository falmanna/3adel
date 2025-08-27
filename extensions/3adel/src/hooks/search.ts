import { HookExtensionContext } from "@directus/extensions";
import { EventContext, FieldFilterOperator, FieldOverview, LogicalFilterOR } from "@directus/types";
import { validate as isUuid } from "uuid";

import { CollectionName } from "../models";
import { getUserPermissions } from "../utils/directus";

type COLLECTION = CollectionName;
type FIELD = string;

type ISearchOptions = Partial<
	Record<
		COLLECTION,
		{
			string?: Record<FIELD, true | "uppercase" | "lowercase">;
			number?: Record<FIELD, "_contains" | "_eq">;
		}
	>
>;

// add nested fields to search
const SearchOptions: ISearchOptions = {
};

const relationFields = new Set(["uuid", "m2o", "user-created", "user-updated"]);
const numberTypes = new Set(["integer", "float"]);
const skipTypes = new Set(["alias", "boolean", "json"]);

export async function advancedSearch(
	query: { search?: string },
	meta: Record<string, any>,
	context: EventContext,
	ext: HookExtensionContext,
) {
	const { search } = query;
	const { schema, accountability } = context;

	if (!search || !schema || !accountability) return query;

	const collection: CollectionName = meta.collection;
	const collectionSchema = schema.collections[collection];

	if (!collectionSchema) return query;

	const newQuery = { filter: {}, ...query };
	delete newQuery.search;
	const filter = newQuery.filter as LogicalFilterOR;
	if (search) {
		filter._or = filter._or || [];
		const fields: Record<string, FieldOverview> = {};

		if (accountability.admin) {
			Object.assign(fields, collectionSchema.fields);
		} else {
			const permissions = await getUserPermissions(ext, accountability);
			const permission = permissions?.find((p) => (p.action === "read" && p.collection) === collection);
			if (!permission) return query;

			if (permission.fields?.includes("*")) Object.assign(fields, collectionSchema.fields);
			else {
				for (const field of permission.fields || []) {
					if (collectionSchema.fields[field]) fields[field] = collectionSchema.fields[field];
				}
			}
		}

		// If search value is uuid, then only search uuid fields
		if (collection in SearchOptions && SearchOptions[collection] && SearchOptions[collection].string) {
			for (const field in SearchOptions[collection].string) {
				const path = field.split(".");
				// User might not have access to this field
				if (!fields[path[0]!]) continue;

				interface DynamicFilter {
					[key: string]: DynamicFilter | FieldFilterOperator;
				}

				const subFilter: DynamicFilter = {};
				let lastPath = subFilter;
				for (const key of path) {
					lastPath[key] = {};
					lastPath = lastPath[key] as DynamicFilter;
				}

				const stringOptions = SearchOptions[collection]?.string;
				const fieldOption = stringOptions?.[field];
				if (fieldOption === "lowercase") {
					(lastPath as FieldFilterOperator)._contains = search.toLowerCase();
				} else if (fieldOption === "uppercase") {
					(lastPath as FieldFilterOperator)._contains = search.toUpperCase();
				} else {
					(lastPath as FieldFilterOperator)._icontains = search;
				}

				filter._or.push(subFilter);
			}
		} else if (isUuid(search)) {
			for (const field in fields) {
				if (
					fields[field] &&
					(fields[field].type === "uuid" ||
						(fields[field].type === "string" && fields[field].special?.some((s) => relationFields.has(s))))
				) {
					filter._or.push({ [field]: { _eq: search } });
				}
			}
		} else if (isNaN(Number(search))) {
			for (const [field, fieldOverview] of Object.entries(fields)) {
				const { type } = fieldOverview;
				if (skipTypes.has(type)) continue;

				if (type === "date") {
					// Use regex to check date format
					if (!search.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

					// Since it is a string we expect the full date
					if (search.length === 10) {
						filter._or.push({ [field]: { _eq: search } });
					}
				} else if (type === "time") {
					// Use regex to check time format
					if (!search.match(/^\d{2}:\d{2}$/)) continue;

					if (search.length === 5) {
						filter._or.push({ [field]: { _eq: search } });
					}
				} else if (type === "timestamp") {
					if (!search.match(/^\d{4}-\d{2}-\d{2}.\d{2}:\d{2}.*$/)) continue;
					filter._or.push({ [field]: { _contains: search } });
				} else if (type === "string") {
					filter._or.push({ [field]: { _contains: search } });
				}
			}
		} else {
			const specialNumFields = SearchOptions[collection] ? SearchOptions[collection].number : undefined;
			for (const [field, fieldOverview] of Object.entries(fields)) {
				const { type } = fieldOverview;
				if (skipTypes.has(type)) continue;

				if (specialNumFields && specialNumFields[field]) {
					filter._or.push({ [field]: { [specialNumFields[field]]: search } });
				} else if (type === "date") {
					// Since it is a number we check only for 4 digit year
					if (search.length === 4) {
						filter._or.push({ [`year(${field})`]: { _eq: Number(search) } });
					}
				} else if (numberTypes.has(type)) {
					filter._or.push({ [field]: { _eq: Number(search) } });
				}
			}
		}
	}

	return newQuery;
}
