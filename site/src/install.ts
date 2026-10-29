export const MARKETPLACE = 'beasaltfish/coinslot'

export function installCommand(id: string): string {
  return `/plugin install ${id} --marketplace ${MARKETPLACE}`
}
