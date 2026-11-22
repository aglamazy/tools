// aglamazo#474 (Agla 134365): on a direct load / reload the auth user is still
// null when a page mounts (authStore starts with user=null and the Firebase
// listener fills it in later), so reading getUser() once on mount misses it.
// This runs `onUser` when a signed-in user is known, and again only if the
// signed-in account changes. Pure: the auth subscription is passed in.

type AuthSnapshot<U> = { user: U | null }
type Subscribe<U> = (listener: (s: AuthSnapshot<U>) => void) => () => void

export function onSignedInUser<U extends { uid: string }>(
  subscribe: Subscribe<U>,
  onUser: (user: U) => void,
): () => void {
  let lastUid: string | null = null
  return subscribe(({ user }) => {
    if (!user) {
      lastUid = null
      return
    }
    if (user.uid === lastUid) return
    lastUid = user.uid
    onUser(user)
  })
}
