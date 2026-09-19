import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: ['selector', '[data-theme="dark"]'],
	theme: {
		extend: {
			// Two faces, one job each. Inter carries the interface: it is
			// built for small sizes, which is most of this app (track
			// metadata, durations, source labels). Lora carries the display
			// type, because dustic is an archive — the brand is "the weird,
			// the wonderful and the forgotten", not a SaaS dashboard, and a
			// serif says that in a way another grotesque cannot.
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				display: ['Lora', 'Georgia', 'ui-serif', 'serif']
			},
			// Every corner in the app resolves to one token so the "sharp
			// corners" the brand promises actually reach buttons, inputs and
			// chips — not just cards. `rounded-full` is deliberately left
			// alone: it is the circle (transport controls, status dots),
			// which is a different shape, not a different radius.
			borderRadius: {
				DEFAULT: 'var(--radius)',
				sm: 'var(--radius)',
				md: 'var(--radius)',
				lg: 'var(--radius)',
				xl: 'var(--radius)',
				'2xl': 'var(--radius)',
				'3xl': 'var(--radius)'
			},
			// Named layers instead of ad-hoc z-50 / z-[99] / z-[100]. Anything
			// that stacks names the layer it belongs to, so the order is
			// readable in one place rather than inferred per component.
			zIndex: {
				overlay: '30',
				nav: '40',
				popover: '50',
				modal: '60',
				toast: '70'
			}
		}
	},
	plugins: [daisyui],
	daisyui: {
		// Two themes, one identity: the same monochrome palette, inverted.
		// Both are declared here (rather than one theme plus `dark:`
		// variants) so daisyUI recolors every component from `data-theme`
		// alone and no component has to know which mode it is in.
		themes: [
			{
				light: {
					primary: '#000000',
					'primary-content': '#ffffff',
					secondary: '#404040',
					'secondary-content': '#ffffff',
					accent: '#1a1a1a',
					'accent-content': '#ffffff',
					neutral: '#262626',
					'neutral-content': '#e5e5e5',
					'base-100': '#ffffff',
					'base-200': '#f5f5f5',
					'base-300': '#e5e5e5',
					'base-content': '#000000',
					info: '#525252',
					success: '#404040',
					warning: '#737373',
					error: '#171717',
					'--rounded-box': '0.25rem',
					'--rounded-btn': '0.25rem',
					'--rounded-badge': '0.25rem',
					'--tab-radius': '0.25rem'
				}
			},
			{
				dark: {
					primary: '#f5f5f5',
					'primary-content': '#0f0f0f',
					secondary: '#a3a3a3',
					'secondary-content': '#0f0f0f',
					accent: '#ededed',
					'accent-content': '#0f0f0f',
					// Cover-art placeholder surface: one step lighter than
					// base-100 so an empty slot still reads as a slot.
					neutral: '#262626',
					'neutral-content': '#ededed',
					'base-100': '#0f0f0f',
					'base-200': '#1a1a1a',
					'base-300': '#2b2b2b',
					'base-content': '#ededed',
					info: '#a3a3a3',
					success: '#a3a3a3',
					warning: '#8f8f8f',
					error: '#ededed',
					'--rounded-box': '0.25rem',
					'--rounded-btn': '0.25rem',
					'--rounded-badge': '0.25rem',
					'--tab-radius': '0.25rem'
				}
			}
		]
	}
};
