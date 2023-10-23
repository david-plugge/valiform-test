import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { page } from '$app/stores';
import { fail } from '@sveltejs/kit';
import { get, writable } from 'svelte/store';
import * as v from 'valibot';
import { getSchemaDefaults, type GenericSchema, getSchemaConfig } from './utils';
import { validateRequest } from './validator';

export function createFormActionValidation<
	Name extends string,
	Schema extends GenericSchema,
	FormattedIssues = v.FlatErrors<Schema>
>(options: {
	name: Name;
	schema: Schema;
	formatIssues?: (issues: v.Issues) => FormattedIssues;
	initialData?: v.Input<Schema>;
	initialErrors?: boolean;
}) {
	const {
		name,
		schema,
		formatIssues = (issues) => v.flatten(issues) as FormattedIssues,
		initialData,
		initialErrors = false
	} = options;

	let initialStoreData;

	if (initialData) {
		if (initialErrors) {
			const result = v.safeParse(schema, initialData);
			if (result.success) {
				initialStoreData = {
					fields: result.output,
					errors: null
				};
			} else {
				initialStoreData = {
					fields: initialData,
					errors: formatIssues(result.issues)
				};
			}
		} else {
			initialStoreData = {
				fields: initialData,
				errors: null
			};
		}
	} else {
		initialStoreData = {
			fields: getSchemaDefaults(schema),
			errors: null
		};
	}

	const store = writable<{
		fields: v.Input<Schema>;
		errors: FormattedIssues | null;
	}>(initialStoreData, (_, update) => {
		return page.subscribe(($page) => {
			const changes = $page.form?._valiforms?.[name];

			if (changes) {
				update((state) => {
					state.errors = changes.errors ?? null;
					if (!browser && changes.fields) {
						state.fields = changes.fields;
					}

					return state;
				});
			}
		});
	});

	const rootConfig = getSchemaConfig(schema);

	return {
		...store,
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
						state.errors = formatIssues(result.issues);
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
			const { data, result } = await validateRequest(schema, request);

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
									errors: formatIssues(result.issues)
								}
							}
						});
					}
				}
			};
		}
	};
}
