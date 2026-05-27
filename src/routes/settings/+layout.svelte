<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { _ } from '$lib/i18n';

	// Active tab is determined by the URL pathname. Each sub-page should
	// render only its own content; the tab bar lives here so it stays
	// identical across /settings, /settings/profile, /settings/libraries.
	$: pathname = $page.url.pathname;
	$: isPreferences = pathname === `${base}/settings` || pathname === `${base}/settings/`;
	$: isProfile = pathname.startsWith(`${base}/settings/profile`);
	$: isLibraries = pathname.startsWith(`${base}/settings/libraries`);
	$: isAbout = pathname.startsWith(`${base}/settings/about`);
</script>

<div class="p-4 md:p-8 max-w-4xl mx-auto">
	<h2 class="text-3xl font-bold mb-6">{$_('settings.title')}</h2>

	<div class="tabs tabs-boxed mb-6 flex-wrap">
		<a
			href="{base}/settings"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isPreferences}
		>
			{$_('settings.tabs.preferences')}
		</a>
		<a
			href="{base}/settings/profile"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isProfile}
		>
			{$_('settings.tabs.profile')}
		</a>
		<a
			href="{base}/settings/libraries"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isLibraries}
		>
			{$_('settings.tabs.libraries')}
		</a>
		<a
			href="{base}/settings/about"
			class="tab tab-sm sm:tab-md"
			class:tab-active={isAbout}
		>
			{$_('settings.tabs.about')}
		</a>
	</div>

	<slot />
</div>
