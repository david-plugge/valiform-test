import type { Prettify } from './types';
import type * as v from 'valibot';

export type FormatIssues<Output, Format> = Prettify<
	Output extends Record<PropertyKey, any>
		? {
				[K in keyof Output]?: FormatIssues<Output[K], Format>;
		  }
		: Output extends Array<infer Item>
		? Array<FormatIssues<Item, Format>>
		: Format
>;

export function formatIssues(issues: v.Issues, format: (issue: v.Issue) => any) {
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
