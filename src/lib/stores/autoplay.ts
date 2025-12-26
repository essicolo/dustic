// Autoplay rules store

import { writable } from 'svelte/store';
import type { AutoplayRule } from '$lib/types';
import { DEFAULT_AUTOPLAY_RULES } from '$lib/utils/constants';

export interface AutoplayState {
	rules: AutoplayRule[];
	enabled: boolean;
}

const initialState: AutoplayState = {
	rules: DEFAULT_AUTOPLAY_RULES,
	enabled: true
};

function createAutoplayStore() {
	const { subscribe, set, update } = writable<AutoplayState>(initialState);

	return {
		subscribe,

		// Enable/disable a rule
		toggleRule(ruleId: string) {
			update((state) => ({
				...state,
				rules: state.rules.map((rule) =>
					rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
				)
			}));
		},

		// Update rule weight
		setWeight(ruleId: string, weight: number) {
			update((state) => ({
				...state,
				rules: state.rules.map((rule) =>
					rule.id === ruleId ? { ...rule, weight: Math.max(0, Math.min(100, weight)) } : rule
				)
			}));
		},

		// Reorder rules
		reorderRules(fromIndex: number, toIndex: number) {
			update((state) => {
				const newRules = [...state.rules];
				const [removed] = newRules.splice(fromIndex, 1);
				newRules.splice(toIndex, 0, removed);
				return { ...state, rules: newRules };
			});
		},

		// Reset to defaults
		resetToDefaults() {
			update((state) => ({
				...state,
				rules: DEFAULT_AUTOPLAY_RULES
			}));
		},

		// Toggle autoplay entirely
		toggleAutoplay() {
			update((state) => ({
				...state,
				enabled: !state.enabled
			}));
		},

		// Get enabled rules with weights
		getEnabledRules() {
			const state = { rules: DEFAULT_AUTOPLAY_RULES, enabled: true };
			subscribe((s) => (state.rules = s.rules))();
			return state.rules.filter((r) => r.enabled && r.weight > 0);
		}
	};
}

export const autoplayStore = createAutoplayStore();
