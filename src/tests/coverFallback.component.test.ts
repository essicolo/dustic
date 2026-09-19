import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CoverFallback from '$lib/components/CoverFallback.svelte';
import UnavailableRow from '$lib/components/UnavailableRow.svelte';

// Proof that component rendering works at all. `@testing-library/svelte` was
// already a dependency, but vitest resolved Svelte's *server* build, so
// render() threw lifecycle_function_unavailable and any logic worth testing
// had to be lifted out of its component first (see utils/coverArt.ts).
// vitest.config.ts now asks for the browser condition.

describe('component rendering', () => {
	it('renders a Svelte component into the DOM', () => {
		const { container } = render(CoverFallback, { props: { seed: 'x' } });
		expect(container.querySelector('svg')).not.toBeNull();
	});
});

describe('CoverFallback', () => {
	it('draws the tile inline, with no network request', () => {
		const { container } = render(CoverFallback, { props: { seed: 'gd1977-05-08' } });
		expect(container.querySelectorAll('circle').length).toBeGreaterThan(10);
		expect(container.querySelector('img')).toBeNull();
	});

	it('takes its colours from the theme rather than hardcoding them', () => {
		const { container } = render(CoverFallback, { props: { seed: 'x' } });
		expect(container.querySelector('.fill-base-content')).not.toBeNull();
		expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
	});

	it('is hidden from assistive technology, being decoration', () => {
		const { container } = render(CoverFallback, { props: { seed: 'x' } });
		expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});
});

describe('UnavailableRow', () => {
	it('shows the identifier when no title was ever stored', () => {
		const { getByText } = render(UnavailableRow, { props: { identifier: 'some-item' } });
		expect(getByText('some-item')).toBeTruthy();
	});

	it('prefers a stored title over the raw identifier', () => {
		const { getByText, queryByText } = render(UnavailableRow, {
			props: { identifier: 'some-item', title: 'A Record' }
		});
		expect(getByText('A Record')).toBeTruthy();
		expect(queryByText('some-item')).toBeNull();
	});

	it('asks before forgetting: it reports the choice rather than acting on it', () => {
		// The row must never delete from the listener's library on its own —
		// a darkened item can come back.
		const removed: string[] = [];
		const { container } = render(UnavailableRow, {
			props: { identifier: 'some-item', onRemove: (id: string) => removed.push(id) }
		});

		expect(removed).toEqual([]);
		container.querySelector('button')?.click();
		expect(removed).toEqual(['some-item']);
	});
});
