<script lang="ts">
	import { base } from '$app/paths';
	import { APP_VERSION } from '$lib/version';
</script>

<div class="p-4 md:p-8 max-w-3xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">About Dustic</h1>

	<div class="space-y-6">
		<!-- What is Dustic -->
		<section class="card bg-base-200 p-6">
			<h2 class="text-xl font-semibold mb-3">What is Dustic?</h2>
			<p class="text-base-content/80 leading-relaxed">
				Dustic is a minimalist audio player that streams music, audiobooks, podcasts, and other audio
				content directly from the Internet Archive. Browse millions of free audio recordings, from
				live concerts to historical radio programs, all in a clean, modern interface.
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
			<h2 class="text-xl font-semibold mb-3">Audio Source</h2>
			<p class="text-base-content/80 leading-relaxed mb-3">
				All audio content is streamed from the <strong>Internet Archive</strong> (archive.org), a
				non-profit digital library offering free access to millions of historical and cultural
				artifacts. Dustic does not host any audio files - it simply provides a convenient interface
				to discover and play content from the Internet Archive's vast collection.
			</p>
			<a
				href="https://archive.org"
				target="_blank"
				rel="noopener noreferrer"
				class="link link-primary"
			>
				Visit Internet Archive
			</a>
		</section>

		<!-- Content Disclaimer -->
		<section class="card bg-base-200 p-6 border-l-4 border-info">
			<h2 class="text-xl font-semibold mb-3">Content Disclaimer</h2>
			<p class="text-base-content/80 leading-relaxed">
				All content available through Dustic is served directly from the Internet Archive.
				The creator of Dustic is not responsible for the content, accuracy, or availability
				of any audio files or metadata provided by the Internet Archive. Questions or concerns
				about specific content should be directed to the Internet Archive.
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

		<!-- Back to Home -->
		<div class="flex justify-center pt-4">
			<a href="{base}/" class="btn btn-primary">
				Back to Home
			</a>
		</div>
	</div>
</div>
