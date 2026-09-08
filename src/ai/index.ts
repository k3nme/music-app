/**
 * Provider registry.
 *
 * Overtone ships with the local, theory-based provider and nothing else — no
 * keys to configure, no network calls, no data leaving the browser. The
 * registry exists so a model-backed provider can be added later without
 * touching the UI: implement `MusicProvider`, register it here, and the Ideas
 * panel picks it up.
 *
 * A remote provider would need, at minimum:
 *   - an endpoint and credentials, supplied by the app host rather than
 *     hard-coded here
 *   - a serialisation of `MusicalContext` small enough to send (the project is
 *     already plain JSON)
 *   - to return `Suggestion`s whose `apply` is built locally from returned
 *     *data*, never from returned code — the interface deliberately makes
 *     suggestions inspectable and undoable before they touch the project
 */

import { localProvider } from './local'
import type { Capability, MusicalContext, MusicProvider, Suggestion } from './types'

export * from './types'
export { localProvider }

const providers = new Map<string, MusicProvider>([[localProvider.id, localProvider]])
let activeId = localProvider.id

export function registerProvider(provider: MusicProvider) {
  providers.set(provider.id, provider)
}

export function listProviders(): MusicProvider[] {
  return [...providers.values()]
}

export function activeProvider(): MusicProvider {
  return providers.get(activeId) ?? localProvider
}

export function setActiveProvider(id: string) {
  if (providers.has(id)) activeId = id
}

export async function suggest(context: MusicalContext, capability: Capability): Promise<Suggestion[]> {
  const provider = activeProvider()
  if (!provider.capabilities.includes(capability)) return []
  try {
    return await provider.suggest(context, capability)
  } catch (error) {
    console.warn(`[overtone] ${provider.id} could not suggest ${capability}`, error)
    // A failing provider should never block the user; fall back to local.
    if (provider.id !== localProvider.id) return localProvider.suggest(context, capability)
    return []
  }
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  chords: 'Chords',
  bass: 'Bass line',
  drums: 'Drums',
  harmony: 'Harmony',
  arrangement: 'Arrangement',
}
