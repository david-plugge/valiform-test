<script lang="ts" context="module">
	import { createForm } from '$lib';
	import * as v from 'valibot';

	export const myForm = createForm(
		'my-form',
		v.object({
			username: v.string(),
			age: v.optional(v.number(), 18),
			dates: v.array(v.date()),

			agb: v.boolean()
		})
	);
</script>

<pre>{JSON.stringify($myForm, null, 2)}</pre>

<form action="?/{myForm.name}" method="post" use:myForm.enhance>
	<div>
		<input type="text" name="username" bind:value={$myForm.fields.username} />

		{#if $myForm.errors.username}
			<p>{$myForm.errors.username[0]}</p>
		{/if}
	</div>

	<div>
		<input type="text" name="age" use:myForm.validate={'age'} bind:value={$myForm.fields.age} />
		{#if $myForm.errors.age}
			<p>{$myForm.errors.age[0]}</p>
		{/if}
	</div>

	<!-- <input type="date" name="dates" bind:value={$myForm.fields.dates[0]} />
	<input type="date" name="dates" bind:value={$myForm.fields.dates[0]} /> -->

	<button type="submit">Submit</button>
</form>
