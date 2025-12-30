<script lang="ts">
	import AutoplayRuleEditor from '$lib/components/Settings/AutoplayRuleEditor.svelte';
	import { base } from '$app/paths';
</script>

<div class="p-8 max-w-4xl">
	<h2 class="text-3xl font-bold mb-6">Settings</h2>

	<!-- Navigation Tabs -->
	<div class="tabs tabs-boxed mb-6">
		<a href="{base}/settings" class="tab tab-active">Autoplay</a>
		<a href="{base}/settings/profile" class="tab">Profile Data</a>
	</div>

	<!-- Autoplay Settings -->
	<div class="card bg-base-200">
		<div class="card-body">
			<AutoplayRuleEditor />
		</div>
	</div>
</div>
