import { redirect } from "next/navigation"

// The /docs experience is a self-contained slide deck served as a static
// HTML file (see /public/docs/index.html) — built in the style of the
// AgentSpec presentation template. This route exists only to handle the
// canonical /docs path and bounce into the static asset. The click-tracking
// action in `./actions.ts` is still imported by the DocsButton client
// component, so bookmarks and old links keep working.
export default function DocsPage(): never {
  redirect("/docs/index.html")
}
