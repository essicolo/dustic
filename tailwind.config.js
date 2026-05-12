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
			// Default — pure monochrome.
			{
				dustic: {
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
			},
			// Sunset — cream paper, warm dark text, terracotta accent.
			{
				sunset: {
					primary: '#C75B39',
					'primary-content': '#ffffff',
					secondary: '#8B6F47',
					'secondary-content': '#ffffff',
					accent: '#C75B39',
					'accent-content': '#ffffff',
					neutral: '#3A2E22',
					'neutral-content': '#F0EAE0',
					'base-100': '#FAF6F0',
					'base-200': '#F0EAE0',
					'base-300': '#E0D6C5',
					'base-content': '#1F1B16',
					info: '#7B6B58',
					success: '#6F8F5C',
					warning: '#D89A4A',
					error: '#B23A2F'
				}
			},
			// Bubblegum — white canvas with hot-pink kick.
			{
				bubblegum: {
					primary: '#FF4D8D',
					'primary-content': '#ffffff',
					secondary: '#FF8FB3',
					'secondary-content': '#1A1A1F',
					accent: '#FF4D8D',
					'accent-content': '#ffffff',
					neutral: '#1A1A1F',
					'neutral-content': '#FAFAFB',
					'base-100': '#FFFFFF',
					'base-200': '#FAFAFB',
					'base-300': '#EFEFF2',
					'base-content': '#1A1A1F',
					info: '#6B6B75',
					success: '#4FAE7B',
					warning: '#FFAF4D',
					error: '#E5394A'
				}
			},
			// Forest — deep green bed, cream type, sage accent.
			{
				forest: {
					primary: '#8FB996',
					'primary-content': '#1A2E1F',
					secondary: '#4A6B52',
					'secondary-content': '#F0EDE5',
					accent: '#8FB996',
					'accent-content': '#1A2E1F',
					neutral: '#243B29',
					'neutral-content': '#F0EDE5',
					'base-100': '#1A2E1F',
					'base-200': '#243B29',
					'base-300': '#2E4733',
					'base-content': '#F0EDE5',
					info: '#A8B5A8',
					success: '#A6C9A8',
					warning: '#D9C77A',
					error: '#D08A7A'
				}
			},
			// Midnight — near-black backdrop, pale text, electric violet.
			{
				midnight: {
					primary: '#9B6DFF',
					'primary-content': '#ffffff',
					secondary: '#6B5B95',
					'secondary-content': '#E8E6F0',
					accent: '#9B6DFF',
					'accent-content': '#ffffff',
					neutral: '#1A1A22',
					'neutral-content': '#E8E6F0',
					'base-100': '#0F0F14',
					'base-200': '#1A1A22',
					'base-300': '#262633',
					'base-content': '#E8E6F0',
					info: '#9B98B0',
					success: '#7BC97B',
					warning: '#E8B95B',
					error: '#E56A78'
				}
			}
		]
	}
};
