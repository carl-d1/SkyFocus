# SkyFocus design rules

These rules hold for every screen. When something new does not fit them, change this file first.

## Three materials

SkyFocus uses three materials, each with a fixed job. They never stand in for each other and never nest.

### 1. Glass (`.glass`)
Glass is the main UI layer. It floats over the map, the sky and the backdrops.

- **Used for:** the nav rail, top bar items, the flight chip, map controls, the instrument cluster, the booking sheet, settings sheets, the logbook and passport sheets, modals and the timer.
- **Variant:** C "Smoked", chosen in the glass lab. Dark tint, medium blur, strongest text contrast.
- **Rendering:** backdrop blur and saturation, plus SVG displacement refraction where Chromium supports it. Each piece also gets a light rim, a specular highlight along the top edge that follows the pointer, and a soft inner shadow.
- **Tint adapts to the backdrop.** A view marks what is behind it with `data-backdrop="bright"` (sky, light imagery) or `data-backdrop="dark"` (night map), so text stays readable.
- **Controls inside glass** are glass too: pill buttons that squish when pressed, segmented controls and switches.
- **Graphics quality "Low"** turns refraction off and keeps blur and highlight.

### 2. Cockpit (`.readout`, `.well`)
Cockpit is the Flight Ops identity carried into the glass. It is a style for content, not a surface of its own.

- **Type:** monospace (IBM Plex Mono) for every number, with tabular figures. Sizes are `.readout-xl`, `.readout-lg`, `.readout-md` and `.readout-sm`. Condensed signage type (Barlow Condensed) is used for labels and headings.
- **Instrument graphics** are thin and precise: altitude tape, heading tape, segmented progress bar, phase annunciators.
- **`.well`** is a recessed area etched into the glass, using a translucent darker tint and a hairline. It is never a solid black slab.
- **One signal colour (#FFC400)**, used only for active and important states. Muted green and red are used for landed and diverted status only.

### 3. Paper (`.paper`)
Paper is for documents only: the boarding pass (and later the membership card). The logbook, passport, arrival report and check-in form are glass sheets, so they match the rest of the app; stamps shown on glass use a light ink (`SF.stampSVG(s, size, { onDark: true })`).

- Paper items are physical objects resting on the scene, with their own shadow, edge and grain.
- Paper is square-cornered (2px), with ruled boxes, form numbers and printed type.
- Paper is never a panel background, a button or a section fill.

### Nesting rules
- Paper never goes inside glass, and glass never goes inside paper.
- To show a document in a dialog, use the document viewer (`ui.modal({ doc: true })`). It puts the paper and any glass panels side by side on a scrim.
- In dev mode (`?dev=1`) any nesting is outlined in red and logged to the console.

## Spacing
Spacing uses only these values: **4, 8, 12, 16, 24, 32, 48 and 64 px** (`--s-1` to `--s-8`). One-off margins and offsets are not allowed. Sizes of things (widths, heights, icon sizes) are not spacing and may use other values.

## Layout
- **Shell:** a full-height glass nav rail anchored to the left edge (logo at the top, items below, goal ring pinned to the bottom), then the main column.
- **Main column:** a fixed outer gutter on all sides, 24px up to 1679px wide and 32px above that. Every screen's content starts at the same x and y.
- **Top bar:** one 48px row at the top of the main column. Every overlay sits in it:
  - left slot: screen title or flight chip
  - centre slot: status line
  - right slot: tools, map modes, daily goal
- **Status line:** announcements and toasts share the centre slot. The newest message replaces the previous one, so messages never cover content.
- **Fill the viewport.** Map screens, arrival, gate, layover, logbook and passport are exactly one viewport tall. Content stretches or centres; it never leaves the bottom half empty.
- **Side-by-side cards** share a grid row, so their top and bottom edges match.
- **Maps** fit the route into the free area left between panels (`insets`), with 48px of padding. Panels never cover the route or its markers.

## Motion

- UI movement uses springs, not linear fades. CSS transitions use `var(--spring)`, `var(--spring-soft)` or `var(--spring-snap)`, which `js/motion.js` fills with real spring curves through `linear()`. Anything that follows input (tilt, flip, banking) uses `SF.motion.spring()`.
- Reduced motion (system or Settings) turns springs into jumps, swaps 3D scenes for the 2D side view and drops page transitions.
- Graphics quality: Low gives the static logo instead of the hero plane, fewer clouds and particles, no refraction.

## Copy
Copy is short and operational: "Boarding closed", "Hold 1 of 2", "Diverted", "Stamp issued".

- No exclamation marks.
- No motivational filler.
- No em dashes or en dashes anywhere. Use a full stop, comma, colon or brackets instead, and write ranges as "to".
