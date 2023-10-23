import { safeParse } from 'valibot';
import { coerceFormData, type GenericSchema } from './utils';

export async function validateRequest(schema: GenericSchema, request: Request) {
	const contentType = request.headers.get('content-type');

	if (
		contentType?.startsWith('application/x-www-form-urlencoded') ||
		contentType?.startsWith('multipart/form-data')
	) {
		const data = coerceFormData(schema, await request.formData());

		return {
			data,
			result: safeParse(schema, data)
		};
	} else if (contentType?.startsWith('application/json')) {
		const data = await request.json();
		return {
			data,
			result: safeParse(schema, data)
		};
	}

	throw new TypeError(`Invalid content-type: ${contentType}`);
}
