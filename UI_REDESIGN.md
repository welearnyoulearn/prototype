# UI / UX redesign — dev

## Product and priority journeys

WeLearnYouLearn connects school operations with teaching, student learning and parent access. School administrators manage people and school operations; teachers manage classes and attendance; students find learning materials and results; parents follow their children; platform administrators manage schools and platform configuration.

The redesign prioritizes choosing the correct portal, signing in, locating a daily task, understanding current information, and moving between views without losing context. Changes are confined to presentation and UI interactions. Backend routes, request bodies, calculations, authentication handlers and feature gates are preserved.

## Audit and design response

| Area | Finding | Response |
| --- | --- | --- |
| Hierarchy | Large decorative headings and colorful metric cards competed with daily tasks. | Compact page titles, clear action hierarchy and flatter metric groups. |
| UX | Account help, password visibility and notification dismissal were inconsistent. | Shared account entry, labeled controls and accessible popover behavior. |
| Information architecture | Each portal used a different shell and mobile navigation treatment. | Shared workspace anatomy, explicit current-page indication and responsive navigation. |
| Typography | Tiny metadata, heavy weights and tightly packed labels reduced readability. | Regular body copy, restrained semibold headings and readable metadata. |
| Spacing | Nested cards and large radii inflated layouts without meaningful grouping. | Dividers and whitespace group related content; shared control and panel spacing. |
| Color | Role-specific purple, blue and orange decoration competed with statuses. | Forest-green actions and warm neutral surfaces; semantic status colors retained. |
| Components | Buttons, fields, loaders and modal treatments varied across screens. | Refined shared controls, consistent loading presentation and viewport-safe dialogs. |
| Interaction | Navigation overlays and bespoke dropdowns lacked predictable keyboard behavior. | Radix focus management, Escape dismissal and trigger focus restoration. |
| Mobile | Fixed-height assumptions, navigation positioning and overflowing overlays weakened small-screen use. | Flexible headers, mobile drawers, a safe-area student navigation footer and scrollable dialogs. |
| Accessibility | Missing input associations, ambiguous icon buttons and inconsistent focus styling. | Associated labels, descriptive control names, visible focus, aria-current and disclosure states. |
| Character | Generic marketing decoration lacked a school-specific identity; the first simplified pass was too plain. | A reusable campus illustration brings warmth to landing and account entry, alongside meaningful portal icons. |
| Complexity | Repeated surface treatments made ordinary information look equally important. | Reduced decoration in dashboards, profiles, management lists and learning views. |

## Visual system

- Typography: existing Plus Jakarta Sans; page titles typically 24–28px, sections 16px, body 14px and metadata 12px. Headings use semibold, with compact letter spacing and comfortable body line heights.
- Rhythm: 4px increments; 16–24px grouping and 24–32px desktop workspace padding. Smaller screens use 16–20px padding.
- Layout: 240px desktop navigation, flexible scrollable workspace, 1152px entry-page container and constrained account forms. Desktop sidebars become modal drawers below 1024px.
- Surfaces: warm canvas `#f8f9f6`, white content and subdued navigation. Border color `#dce3d9`; dividers organize lists and tables.
- Color: ink `#202a25`, primary forest `#235b46`; status colors remain tied to meaning.
- Geometry: 6px controls, 8px panels. Shadows primarily communicate overlay elevation.
- Controls: clear solid primary actions, quiet secondary actions, 40px desktop and 44px mobile touch controls; account inputs and submits are 48px.
- Icons: consistent Lucide strokes, labels for icon-only controls, decorative artwork hidden from assistive technology.
- Motion: 150–220ms hover, navigation and view transitions use an ease-out curve and move only a few pixels. Drawers communicate spatial origin. Full-page loaders preserve the expected workspace shape, sections use a quiet skeleton sheen, and buttons keep their action label visible while processing. Continuous motion is limited to active progress feedback. Shared Framer Motion and CSS both respect reduced-motion preferences.

## Verification

- Production build passed, including TypeScript and generation of all 213 static pages. Build checks ran with the development server stopped to avoid generated-type cache conflicts.
- Browser checks covered the public landing page and account-entry flows at desktop and phone sizes. The final illustrated landing fits all four portal choices in the tested 390 × 844 viewport without horizontal overflow.
- Shared navigation was tested at desktop, tablet and phone widths using a temporary component review page. Focus trapping, Escape dismissal, focus restoration, navigation selection, dialog scrolling and popover bounds passed. The temporary route was removed.
- Password visibility, recovery navigation and invalid-credentials feedback were checked. No real password was changed.
- AST comparison found no changes to existing fetch calls in the modified frontend files.
- ESLint comparison against HEAD found no new findings. The checked baseline already contained 37 errors and 31 warnings; these were not resolved by altering application logic. The new illustration and updated entry components also passed targeted lint.
- Full signed-in, real-data verification remains pending working demo access. Component-fixture checks do not establish end-to-end coverage for every portal screen or business workflow.

Impeccable was unavailable in this workspace. The user approved proceeding with their supplied design requirements; no Impeccable execution is claimed.
