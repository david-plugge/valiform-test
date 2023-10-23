<script lang="ts" context="module">
	import { createFormActionValidation } from '$lib';
	import * as v from 'valibot';

	export const myForm = createFormActionValidation({
		name: 'my-form',
		schema: v.object({
			username: v.string(),
			age: v.optional(v.number(), 18),
			dates: v.array(v.date()),

			agb: v.boolean()
		})
	});
</script>

<pre>{JSON.stringify($myForm, null, 2)}</pre>

<form action="?/{myForm.name}" method="post" use:myForm.enhance>
	<div>
		<input type="text" name="username" bind:value={$myForm.fields.username} />

		{#if $myForm.errors?.nested.username}
			<p>{$myForm.errors.nested.username[0]}</p>
		{/if}
	</div>

	<div>
		<input type="text" name="age" use:myForm.validate={'age'} bind:value={$myForm.fields.age} />
		{#if $myForm.errors?.nested.age}
			<p>{$myForm.errors.nested.age[0]}</p>
		{/if}
	</div>

	<!-- <input type="date" name="dates" bind:value={$myForm.fields.dates[0]} />
	<input type="date" name="dates" bind:value={$myForm.fields.dates[0]} /> -->

	<button type="submit">Submit</button>
</form>
