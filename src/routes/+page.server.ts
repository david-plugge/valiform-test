import { myForm } from './+page.svelte';

export const actions = {
	[myForm.name]: async ({ request }) => {
		const { result, fail } = await myForm.validateAction(request);

		if (!result.success) {
			return fail();
		}

		console.log(result.output);
	}
};
