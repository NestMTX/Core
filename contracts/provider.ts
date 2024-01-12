import type { ApplicationInterface } from './application'

export interface ProviderInterface {
  (app: ApplicationInterface): void
}
