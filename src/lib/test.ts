import * as v from 'valibot';

type Prettify<T> = { [K in keyof T]: T[K] } & {};

const schema = v.object({
	a: v.array(
		v.object({
			a: v.string()
		})
	),
	b: v.string([v.minLength(5), v.length(4)])
});

const result = v.safeParse(schema, {
	a: [{}],
	b: ''
});

if (!result.success) {
	const issues = formatIssues(schema, result.issues, (i) => ({
		reason: i.reason,
		validation: i.validation
	}));
	console.log(result.issues);

	console.log(issues);
}

type FormatIssues<Output, Format> = Prettify<
	Output extends Record<PropertyKey, any>
		? {
				[K in keyof Output]: FormatIssues<Output[K], Format>;
		  }
		: Output extends Array<infer Item>
		? Array<FormatIssues<Item, Format>>
		: Format
>;

function formatIssues<Schema extends v.BaseSchema, Format>(
	schema: Schema,
	issues: v.Issues,
	format: (issue: v.Issue) => Format
): FormatIssues<v.Output<Schema>, Format> {
	let out: any = {};

	for (const issue of issues) {
		let cur = out;
		let key: string | number = 'error';

		if (!issue.path) {
			(cur[key] ??= []).push(format(issue));
			continue;
		}

		for (let i = 0; i < issue.path.length; i++) {
			switch (issue.path[i].schema) {
				case 'array':
				case 'tuple':
				case 'set': {
					cur = cur[key] ??= [];
					break;
				}
				case 'map':
				case 'object':
				case 'record': {
					cur = cur[key] ??= {};
					break;
				}
			}
			key = issue.path[i].key;
		}

		(cur[key] ??= []).push(format(issue));
	}

	return out.error;
}
