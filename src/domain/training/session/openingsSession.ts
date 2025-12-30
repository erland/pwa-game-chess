import type { OpeningsSessionState } from './openingsSession.types';

import { defaultOpeningsSessionState } from './openingsSession.helpers';

export { reduceOpeningsSession } from './openingsSession.reducer.base';

/**
 * Convenience factory for initializing controller state.
 * Kept in this module to preserve the original import surface.
 */
export function createOpeningsSessionState(init?: Partial<OpeningsSessionState>): OpeningsSessionState {
  return { ...defaultOpeningsSessionState(), ...init };
}
