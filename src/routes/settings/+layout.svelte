<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	// Active tab is determined by the URL pathname. Each sub-page should
	// render only its own content; the tab bar lives here so it stays
	// identical across /settings, /settings/profile, /settings/libraries.
	$: pathname = $page.url.pathname;
	$: isPreferences = pathname === `${base}/settings` || pathname === `${base}/settings/`;
	$: isProfile = pathname.startsWith(`${base}/settings/profile`);
	$: isLibraries = pathname.startsWith(`${base}/settings/libraries`);
</script>

<div class="p-4 md:p-8 max-w-4xl mx-auto">
	<h2 class="text-3xl font-bold mb-6">Settings</h2>

	<div class="tabs tabs-boxed mb-6 flex-wrap">
		<a
			href="{base}/settings"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isPreferences}
		>
			Preferences
		</a>
		<a
			href="{base}/settings/profile"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isProfile}
		>
			Profile
		</a>
		<a
			href="{base}/settings/libraries"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isLibraries}
		>
			Audio sources
		</a>
	</div>

	<slot />
</div>
