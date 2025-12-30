<script lang="ts">
	import { Icon } from '@iconify/svelte';

	export let icon: string;
	export let width: string | number = '1em';
	export let height: string | number = '1em';
	export let className: string = '';
</script>

<Icon {icon} {width} {height} class={className} />
