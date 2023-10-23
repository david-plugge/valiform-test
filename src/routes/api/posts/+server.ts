import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';

export const POST = withValidation(
	v.object({
		username: v.string()
	}),
	({ body }) => {
		return body;
	}
);

type TypedResponse<Data, Status extends number = 200> = Response & {
	json(): Promise<Data>;
	status: Status;
	ok: `${Status}` extends `2${string}` ? true : false;
};

function withValidation<Schema extends v.BaseSchema, Event extends RequestEvent, ResponseData>(
	schema: Schema,
	handler: (
		event: Event & { body: v.Output<Schema> }
	) => ResponseData | Response | Promise<ResponseData | Response>
): (event: Event) => Promise<TypedResponse<ResponseData>> {
	return async (event) => {
		const json = await event.request.json();
		const result = await v.safeParseAsync(schema, json);

		if (!result.success) {
			return json({
				success: false,
				issues: v.flatten(result.issues)
			});
		}

		const response = await handler({ ...event, body: result.output });

		if (response instanceof Response) {
			return response;
		}
		return json(response);
	};
}
