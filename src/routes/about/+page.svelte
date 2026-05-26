<script lang="ts">
	import { base } from '$app/paths';
	import { APP_VERSION } from '$lib/version';
	import Icon from '$lib/components/Icon.svelte';
	import { _ } from '$lib/i18n';
</script>

<div class="p-4 md:p-8 max-w-3xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">{$_('about.title')}</h1>

	<div class="space-y-6">
		<!-- What is Dustic -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.what.title')}</h2>
			<p class="text-base-content/80 leading-relaxed">
				{$_('about.what.body')}
			</p>
		</section>

		<!-- Progressive Web App -->
		<section class="card bg-base-200 p-6 border-l-4 border-primary">
			<h2 class="text-xl font-semibold mb-3">{$_('about.pwa.title')}</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					{$_('about.pwa.introBefore')}<strong>{$_('about.pwa.introStrong')}</strong>{$_('about.pwa.introAfter')}
				</p>

				<div class="space-y-4 mt-4">
					<div>
						<h3 class="font-semibold text-base-content mb-2">{$_('about.pwa.iosTitle')}</h3>
						<ol class="list-decimal list-inside ml-4 space-y-1">
							<li>{$_('about.pwa.ios1')}</li>
							<li>{$_('about.pwa.ios2')}</li>
							<li>{$_('about.pwa.ios3')}</li>
							<li>{$_('about.pwa.ios4')}</li>
						</ol>
					</div>

					<div>
						<h3 class="font-semibold text-base-content mb-2">{$_('about.pwa.androidTitle')}</h3>
						<ol class="list-decimal list-inside ml-4 space-y-1">
							<li>{$_('about.pwa.android1')}</li>
							<li>{$_('about.pwa.android2')}</li>
							<li>{$_('about.pwa.android3')}</li>
							<li>{$_('about.pwa.android4')}</li>
						</ol>
					</div>
				</div>

				<p class="mt-4">
					{$_('about.pwa.outro')}
				</p>
			</div>
		</section>

		<!-- Author -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.creator.title')}</h2>
			<p class="text-base-content/80 leading-relaxed">
				{$_('about.creator.bodyBefore')}<strong>{$_('about.creator.bodyName')}</strong>{$_('about.creator.bodyAfter')}
			</p>
		</section>

		<!-- Data Source -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.sources.title')}</h2>
			<div class="space-y-4 text-base-content/80 leading-relaxed">
				<div>
					<h3 class="font-semibold text-base-content mb-1">{$_('about.sources.iaTitle')}</h3>
					<p class="mb-2">
						{$_('about.sources.iaBodyBefore')}<strong>{$_('about.sources.iaBodyStrong')}</strong>{$_('about.sources.iaBodyAfter')}
					</p>
					<a
						href="https://archive.org"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary text-sm"
					>
						{$_('about.sources.iaLink')}
					</a>
				</div>
				<div>
					<h3 class="font-semibold text-base-content mb-1">{$_('about.sources.fwTitle')}</h3>
					<p class="mb-2">
						<strong>{$_('about.sources.fwBodyStrong')}</strong>{$_('about.sources.fwBodyAfter')}
					</p>
					<a
						href="https://funkwhale.audio"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary text-sm"
					>
						{$_('about.sources.fwLink')}
					</a>
				</div>
				<p class="text-sm text-base-content/60">
					{$_('about.sources.footer')}
				</p>
			</div>
		</section>

		<!-- Content Disclaimer -->
		<section class="card bg-base-200 p-6 border-l-4 border-info">
			<h2 class="text-xl font-semibold mb-3">{$_('about.disclaimer.title')}</h2>
			<p class="text-base-content/80 leading-relaxed">
				{$_('about.disclaimer.body')}
			</p>
		</section>

		<!-- Privacy & Data -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.privacy.title')}</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					<strong>{$_('about.privacy.introStrong')}</strong>{$_('about.privacy.introRest')}
				</p>
				<p>
					{$_('about.privacy.storage')}
				</p>
				<ul class="list-disc list-inside ml-4 space-y-1">
					<li>{$_('about.privacy.point1')}</li>
					<li>{$_('about.privacy.point2')}</li>
					<li>{$_('about.privacy.point3')}</li>
					<li>{$_('about.privacy.point4')}</li>
				</ul>
				<p class="mt-3">
					<strong>{$_('about.privacy.outroStrong')}</strong>{$_('about.privacy.outroRest')}
				</p>
			</div>
		</section>

		<!-- Backup Warning -->
		<section class="card bg-base-200 p-6 border-l-4 border-warning">
			<h2 class="text-xl font-semibold mb-3 flex items-center gap-2">
				<span>{$_('about.backup.title')}</span>
			</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					{$_('about.backup.intro')}
				</p>
				<ul class="list-disc list-inside ml-4 space-y-1">
					<li>{$_('about.backup.point1')}</li>
					<li>{$_('about.backup.point2')}</li>
					<li>{$_('about.backup.point3')}</li>
					<li>{$_('about.backup.point4')}</li>
				</ul>
				<p class="font-semibold">
					{$_('about.backup.strong')}
				</p>
				<p>
					{$_('about.backup.outro')}
				</p>
			</div>
		</section>

		<!-- Open Source -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.openSource.title')}</h2>
			<p class="text-base-content/80 leading-relaxed mb-3">
				{$_('about.openSource.body')}
			</p>
			<a
				href="https://github.com/essicolo/dustic"
				target="_blank"
				rel="noopener noreferrer"
				class="link link-primary"
			>
				{$_('about.openSource.link')}
			</a>
		</section>

		<!-- Technology -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.tech.title')}</h2>
			<ul class="list-disc list-inside ml-4 space-y-1 text-base-content/80">
				<li>{$_('about.tech.item1')}</li>
				<li>{$_('about.tech.item2')}</li>
				<li>{$_('about.tech.item3')}</li>
				<li>{$_('about.tech.item4')}</li>
			</ul>
		</section>

		<!-- Version -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">{$_('about.version.title')}</h2>
			<p class="text-base-content/80">
				{$_('about.version.current')} <strong>{APP_VERSION}</strong>
			</p>
		</section>

		<!-- Support & Feedback -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-4">{$_('about.support.title')}</h2>
			<div class="space-y-3">
				<a
					href="https://github.com/sponsors/essicolo"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-primary w-full flex items-center gap-2"
				>
					<Icon icon="solar:heart-bold" width="20" />
					<span>{$_('about.support.sponsor')}</span>
				</a>
				<a
					href="https://github.com/essicolo/dustic/issues/new"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-outline w-full flex items-center gap-2"
				>
					<Icon icon="solar:chat-round-dots-bold" width="20" />
					<span>{$_('about.support.feedback')}</span>
				</a>
			</div>
			<p class="text-sm text-base-content/70 mt-4">
				{$_('about.support.footer')}
			</p>
		</section>

		<!-- Back to Home -->
		<div class="flex justify-center pt-4">
			<a href="{base}/" class="btn btn-primary">
				{$_('nav.backToHome')}
			</a>
		</div>
	</div>
</div>
