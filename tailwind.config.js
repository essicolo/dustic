import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: [daisyui],
	daisyui: {
		themes: [
			{
				inde: {
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
					error: '#171717'
				}
			}
		]
	}
};
