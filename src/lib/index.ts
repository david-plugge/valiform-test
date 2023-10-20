import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { page } from '$app/stores';
import { fail } from '@sveltejs/kit';
import { get, writable } from 'svelte/store';
import * as v from 'valibot';

type GenericSchema = v.BaseSchema & { schema: string };

type SchemaConfig = {
	schema: GenericSchema;
	optional: boolean;
	nullable: boolean;
	optionalDefaultValue: unknown;
	nullableDefaultValue: unknown;
};

const schemaConfigCache = new Map<GenericSchema, SchemaConfig>();
function getSchemaConfig(schema: GenericSchema): SchemaConfig {
	const cachedConfig = schemaConfigCache.get(schema);
	if (cachedConfig) {
		return cachedConfig;
	}

	let unwrapped: GenericSchema & { default?: unknown } = schema;
	let optional: boolean;
	let nullable: boolean;
	let optionalDefaultValue: unknown;
	let nullableDefaultValue: unknown;

	while ('wrapped' in unwrapped) {
		if (unwrapped.schema === 'optional') {
			optional ??= true;
			optionalDefaultValue ??= unwrapped.default;
		} else if (unwrapped.schema === 'non_optional') {
			optional ??= false;
			optionalDefaultValue ??= undefined;
		} else if (unwrapped.schema === 'nullable') {
			nullable ??= true;
			nullableDefaultValue ??= unwrapped.default;
		} else if (unwrapped.schema === 'non_nullable') {
			nullable ??= false;
			nullableDefaultValue ??= undefined;
		} else if (unwrapped.schema === 'nullish') {
			nullable ??= true;
			optional ??= true;
			nullableDefaultValue ??= unwrapped.default;
			optionalDefaultValue ??= unwrapped.default;
		} else if (unwrapped.schema === 'non_nullish') {
			nullable ??= false;
			optional ??= false;
			nullableDefaultValue ??= undefined;
			optionalDefaultValue ??= undefined;
		}
		unwrapped = unwrapped['wrapped'] as GenericSchema;
	}

	return {
		schema: unwrapped,
		optional: (optional ??= false),
		nullable: (nullable ??= false),
		optionalDefaultValue: optional ? optionalDefaultValue : undefined,
		nullableDefaultValue: nullable ? nullableDefaultValue : undefined
	};
}

function coerceFormDataEntry(schema: GenericSchema, value: FormDataEntryValue | null) {
	if (typeof value !== 'string') {
		return value;
	}

	switch (schema.schema) {
		case 'any':
			return '';
		case 'string':
		case 'enum':
			return String(value);
		case 'number':
			return +value;
		case 'boolean':
			return Boolean(['on', 'true', 'yes'].includes(value)).valueOf();
		case 'symbol':
			return Symbol(value);
		case 'date':
			return new Date(value);
		case 'bigint':
			return BigInt(value);
		case 'literal': {
			const literalSchema = schema as v.LiteralSchema<v.Literal>;
			switch (typeof literalSchema.literal) {
				case 'bigint':
					return BigInt(value);
				case 'boolean':
					return Boolean(['on', 'true', 'yes'].includes(value)).valueOf();
				case 'number':
					return +value;
				case 'string':
					return value;
				case 'symbol':
					return Symbol(value);
				default:
					throw new TypeError(`Unsupported literal type: ${typeof literalSchema.literal}`);
			}
		}
		case 'native_enum': {
			const enumSchema = schema as v.NativeEnumSchema<v.NativeEnum>;

			if (value !== null && value in enumSchema.nativeEnum) {
				const enumValue = enumSchema.nativeEnum[value];
				if (typeof enumValue === 'number') return enumValue;
				else if (enumValue in enumSchema.nativeEnum) return enumSchema.nativeEnum[enumValue];
			} else if (value !== null && Object.values(enumSchema.nativeEnum).includes(value)) {
				return value;
			}
			return undefined;
		}

		default:
			throw new TypeError(`Unsupported type: ${schema.schema}`);
	}
}

function getSchemaDefaults(schema: GenericSchema): unknown {
	const config = getSchemaConfig(schema);

	if (config.nullable) {
		return config.nullableDefaultValue ?? null;
	}
	if (config.optional) {
		return config.optionalDefaultValue ?? undefined;
	}

	switch (config.schema.schema) {
		case 'string':
			return '';
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object': {
			const { object } = config.schema as v.ObjectSchema<Record<string, GenericSchema>>;
			const objectDefaults: Record<string, unknown> = {};
			for (const key in object) {
				if (object[key].schema !== 'never') {
					objectDefaults[key] = getSchemaDefaults(object[key]);
				}
			}
			return objectDefaults;
		}
		case 'map':
			return new Map();
		case 'set':
			return new Set();
		case 'record':
			return {};
		case 'bigint':
			return BigInt(0);
		case 'symbol':
			return Symbol();
		case 'date':
			return new Date();
		case 'union':
			const unionSchema = config.schema as v.UnionSchema<v.UnionOptions>;
			return getSchemaConfig(unionSchema.union[0] as GenericSchema);
		case 'blob':
			return new Blob();
		case 'enum':
			const enumSchema = config.schema as v.EnumSchema<v.Enum>;
			return enumSchema.enum[0];
		case 'literal':
			const literalSchema = config.schema as v.LiteralSchema<v.Literal>;
			return literalSchema.literal;
		case 'nan':
			return NaN;
		case 'tuple':
			const tupleSchema = config.schema as v.TupleSchema<v.TupleShape>;
			return tupleSchema.tuple.items.map((schema) => getSchemaDefaults(schema as GenericSchema));
		case 'void':
			return void 0;
		case 'native_enum':
			const nativeEnumSchema = config.schema as v.NativeEnumSchema<v.NativeEnum>;
			return Object.values(nativeEnumSchema.nativeEnum)[0];
	}

	return undefined;
}

function coerceFormData<Schema extends GenericSchema>(schema: Schema, formData: FormData) {
	const config = getSchemaConfig(schema);

	const output: any = {};

	if (schema.schema !== 'object') {
		throw new TypeError(`the provided schema must by of type object`);
	}

	const objectSchema = schema as unknown as v.ObjectSchema<v.ObjectShape>;

	for (const key in objectSchema.object) {
		const itemSchema = getSchemaConfig(objectSchema.object[key] as GenericSchema);

		if (itemSchema.schema.schema === 'array') {
			const arraySchema = itemSchema.schema as v.ArraySchema<any>;

			const rawValues = formData.getAll(key);
			output[key] = rawValues.map((value) => coerceFormDataEntry(arraySchema.array.item, value));
		} else {
			const rawValue = formData.get(key);
			output[key] = coerceFormDataEntry(itemSchema.schema, rawValue);
		}
	}

	return output;
}

export function createForm<Schema extends GenericSchema>(name: string, schema: Schema) {
	function validateFormData(formData: FormData) {
		const data = coerceFormData(schema, formData);
		return {
			data,
			result: v.safeParse(schema, data)
		};
	}
	function validateJson(data: unknown) {
		return {
			data,
			result: v.safeParse(schema, data)
		};
	}
	async function validateRequest(request: Request) {
		const contentType = request.headers.get('content-type');

		if (
			contentType?.startsWith('application/x-www-form-urlencoded') ||
			contentType?.startsWith('multipart/form-data')
		) {
			return validateFormData(await request.formData());
		} else if (contentType?.startsWith('application/json')) {
			return validateJson(await request.json());
		}

		throw new TypeError(`Invalid content-type: ${contentType}`);
	}

	const store = writable<{
		fields: v.Input<Schema>;
		errors: {
			[K in keyof v.Input<Schema>]?: string[];
		};
	}>(
		{
			fields: getSchemaDefaults(schema),
			errors: {}
		},
		(_, update) => {
			return page.subscribe(($page) => {
				const changes = $page.form?._valiforms?.[name];

				if (changes) {
					update((state) => {
						state.errors = changes.errors ?? {};
						if (!browser && changes.fields) {
							state.fields = changes.fields;
						}

						return state;
					});
				}
			});
		}
	);

	const rootConfig = getSchemaConfig(schema);

	return {
		...store,
		validateFormData,
		validateJson,
		validateRequest,
		get name() {
			return name;
		},
		validate(node: HTMLElement, field: keyof v.Input<Schema>) {
			const schema: GenericSchema = (rootConfig.schema as v.ObjectSchema<any>).object[field];

			function check() {
				console.log(schema, get(store).fields[field]);

				const result = v.safeParse(schema, get(store).fields[field]);
				console.log(result);

				store.update((state) => {
					return state;
				});
			}

			function handleBlur() {
				check();
			}
			function handleInput() {
				check();
			}

			node.addEventListener('blur', handleBlur);
			node.addEventListener('input', handleInput);

			return {
				destroy() {
					node.removeEventListener('blur', handleBlur);
					node.removeEventListener('input', handleInput);
				}
			};
		},
		enhance(node: HTMLFormElement) {
			return enhance(node, ({ cancel }) => {
				const result = v.safeParse(schema, get(store).fields);
				if (!result.success) {
					cancel();
					store.update((state) => {
						state.errors = v.flatten(result.issues).nested;
						return state;
					});
				}

				return async ({ update, result }) => {
					await update({
						reset: false
					});
					if (result.type === 'success') {
						store.update((state) => {
							state.fields = getSchemaDefaults(schema);
							return state;
						});
					}
				};
			});
		},
		async validateAction(request: Request) {
			const { data, result } = await validateRequest(request);

			return {
				result,
				data,
				fail() {
					if (result.success) {
					} else {
						return fail(400, {
							_valiforms: {
								[name]: {
									fields: data,
									errors: v.flatten(result.issues).nested
								}
							}
						});
					}
				}
			};
		}
	};
}
