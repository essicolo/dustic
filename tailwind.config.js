/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: [require('daisyui')],
	daisyui: {
		themes: [
			{
				dustic: {
					primary: '#a855f7',
					secondary: '#818cf8',
					accent: '#c084fc',
					neutral: '#1e293b',
					'base-100': '#0f172a',
					'base-200': '#1e293b',
					'base-300': '#334155',
					info: '#3b82f6',
					success: '#10b981',
					warning: '#f59e0b',
					error: '#ef4444'
				}
			}
		]
	}
};
