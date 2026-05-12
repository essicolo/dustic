<script lang="ts">
	import { base } from '$app/paths';
	import { APP_VERSION } from '$lib/version';
	import Icon from '$lib/components/Icon.svelte';
</script>

<div class="p-4 md:p-8 max-w-3xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">About Dustic</h1>

	<div class="space-y-6">
		<!-- What is Dustic -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">What is Dustic?</h2>
			<p class="text-base-content/80 leading-relaxed">
				Dustic is a minimalist audio player that streams music, audiobooks, podcasts, and other audio
				content from the Internet Archive and FunkWhale. Browse millions of free audio recordings,
				from live concerts to historical radio programs, all in a clean, modern interface.
			</p>
		</section>

		<!-- Progressive Web App -->
		<section class="card bg-base-200 p-6 border-l-4 border-primary">
			<h2 class="text-xl font-semibold mb-3">Install as an App</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					Dustic is a <strong>Progressive Web App (PWA)</strong>, which means you can install it
					on your device and use it like a native app. Once installed, it works offline for your
					saved content and provides a full-screen experience without browser UI.
				</p>

				<div class="space-y-4 mt-4">
					<div>
						<h3 class="font-semibold text-base-content mb-2">On iPhone/iPad:</h3>
						<ol class="list-decimal list-inside ml-4 space-y-1">
							<li>Open Dustic in Safari (not Chrome or other browsers)</li>
							<li>Tap the Share button (square with arrow pointing up)</li>
							<li>Scroll down and tap "Add to Home Screen"</li>
							<li>Tap "Add" to confirm</li>
						</ol>
					</div>

					<div>
						<h3 class="font-semibold text-base-content mb-2">On Android:</h3>
						<ol class="list-decimal list-inside ml-4 space-y-1">
							<li>Open Dustic in Chrome</li>
							<li>Tap the menu (three dots) in the top-right corner</li>
							<li>Tap "Add to Home screen" or "Install app"</li>
							<li>Tap "Install" to confirm</li>
						</ol>
					</div>
				</div>

				<p class="mt-4">
					After installation, Dustic will appear on your home screen with its icon and can be
					launched like any other app on your device.
				</p>
			</div>
		</section>

		<!-- Author -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Creator</h2>
			<p class="text-base-content/80 leading-relaxed">
				Dustic is developed by <strong>Essi Parent</strong>.
			</p>
		</section>

		<!-- Data Source -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Audio Sources</h2>
			<div class="space-y-4 text-base-content/80 leading-relaxed">
				<div>
					<h3 class="font-semibold text-base-content mb-1">Internet Archive</h3>
					<p class="mb-2">
						The <strong>Internet Archive</strong> (archive.org) is a non-profit digital library offering
						free access to millions of historical and cultural artifacts, including live concerts,
						audiobooks, podcasts, and radio programs.
					</p>
					<a
						href="https://archive.org"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary text-sm"
					>
						Visit archive.org
					</a>
				</div>
				<div>
					<h3 class="font-semibold text-base-content mb-1">FunkWhale</h3>
					<p class="mb-2">
						<strong>FunkWhale</strong> is a decentralized, community-driven music platform.
						You can connect to public FunkWhale instances in Settings to search and stream
						their music libraries alongside Internet Archive content.
					</p>
					<a
						href="https://funkwhale.audio"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary text-sm"
					>
						Visit funkwhale.audio
					</a>
				</div>
				<p class="text-sm text-base-content/60">
					Dustic does not host any audio files. It provides a unified interface to discover
					and play content from these sources.
				</p>
			</div>
		</section>

		<!-- Content Disclaimer -->
		<section class="card bg-base-200 p-6 border-l-4 border-info">
			<h2 class="text-xl font-semibold mb-3">Content Disclaimer</h2>
			<p class="text-base-content/80 leading-relaxed">
				All content available through Dustic is served directly from the Internet Archive
				and connected FunkWhale instances. The creator of Dustic is not responsible for the
				content, accuracy, or availability of any audio files or metadata provided by these
				sources.
			</p>
		</section>

		<!-- Privacy & Data -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Privacy & Data Collection</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					<strong>No data collection.</strong> Dustic does not collect, transmit, or store any personal
					information on external servers. Your listening activity is completely private.
				</p>
				<p>
					All your data (favorites, playlists, listening history, and settings) is stored locally
					in your browser's cache using localStorage. This means:
				</p>
				<ul class="list-disc list-inside ml-4 space-y-1">
					<li>Your data never leaves your device</li>
					<li>No account or login required</li>
					<li>Your privacy is fully protected</li>
					<li>Data persists across browser sessions</li>
				</ul>
				<p class="mt-3">
					<strong>Account-free design:</strong> To keep the app simple and privacy-focused, there is no cloud infrastructure or account system to sync profiles between devices. However, you can export and import your profile using the buttons in Settings → Profile Data to transfer your data between devices.
				</p>
			</div>
		</section>

		<!-- Backup Warning -->
		<section class="card bg-base-200 p-6 border-l-4 border-warning">
			<h2 class="text-xl font-semibold mb-3 flex items-center gap-2">
				<span>Important: Backup Your Profile</span>
			</h2>
			<div class="space-y-3 text-base-content/80 leading-relaxed">
				<p>
					While your data is automatically saved in your browser's cache, it can be lost if you:
				</p>
				<ul class="list-disc list-inside ml-4 space-y-1">
					<li>Clear your browser's cache or data</li>
					<li>Use private/incognito mode</li>
					<li>Uninstall or reset your browser</li>
					<li>Switch browsers or devices</li>
				</ul>
				<p class="font-semibold">
					We strongly recommend downloading your profile regularly to avoid losing your favorites,
					playlists, and listening history.
				</p>
				<p>
					You can download and upload your profile using the buttons in the sidebar's Profile
					Manager section.
				</p>
			</div>
		</section>

		<!-- Open Source -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Open Source</h2>
			<p class="text-base-content/80 leading-relaxed mb-3">
				Dustic is open source software. You can view the source code, report issues, or contribute
				to the project on GitHub.
			</p>
			<a
				href="https://github.com/essicolo/dustic"
				target="_blank"
				rel="noopener noreferrer"
				class="link link-primary"
			>
				View on GitHub
			</a>
		</section>

		<!-- Technology -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Built With</h2>
			<ul class="list-disc list-inside ml-4 space-y-1 text-base-content/80">
				<li>SvelteKit - Application framework</li>
				<li>TypeScript - Type-safe development</li>
				<li>TailwindCSS & DaisyUI - Styling</li>
				<li>Iconify (Solar Icons) - Icon system</li>
			</ul>
		</section>

		<!-- Version -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">Version</h2>
			<p class="text-base-content/80">
				Current version: <strong>{APP_VERSION}</strong>
			</p>
		</section>

		<!-- Support & Feedback -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-4">Support & Feedback</h2>
			<div class="space-y-3">
				<a
					href="https://github.com/sponsors/essicolo"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-primary w-full flex items-center gap-2"
				>
					<Icon icon="solar:heart-bold" width="20" />
					<span>Sponsor this project</span>
				</a>
				<a
					href="https://github.com/essicolo/dustic/issues/new"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-outline w-full flex items-center gap-2"
				>
					<Icon icon="solar:chat-round-dots-bold" width="20" />
					<span>Send Feedback</span>
				</a>
			</div>
			<p class="text-sm text-base-content/70 mt-4">
				If you enjoy Dustic, consider sponsoring the project. Report bugs or suggest features via GitHub issues.
			</p>
		</section>

		<!-- Back to Home -->
		<div class="flex justify-center pt-4">
			<a href="{base}/" class="btn btn-primary">
				Back to Home
			</a>
		</div>
	</div>
</div>
