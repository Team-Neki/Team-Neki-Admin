# Neki Admin Design QA

## Visual truth and implementation

- reference URL: `https://yapp-admin.suitestudy.com/`
- reference capture: `.product-design/pose-reference/pose-admin-reference-1440.png`
- implementation capture: `.product-design/pose-reference/pose-admin-implementation-1440.png`
- combined comparison: `.product-design/pose-reference/pose-admin-comparison-1440.png`
- comparison viewport: 1440 × 1000 CSS px for both captures
- implementation responsive captures:
  - `.product-design/pose-reference/pose-admin-1024.png`
  - `.product-design/pose-reference/pose-admin-768.png`
  - `.product-design/pose-reference/pose-admin-390.png`
  - `.product-design/pose-reference/pose-upload-390.png`

## Reference traits retained

- A coral product accent, pale gray canvas, white management surface, image-first pose cards, people-count badges, and direct image upload entry remain visible.
- The reference page's four-column contact-sheet rhythm is retained on wide screens and adapts to three, two, and one columns as space narrows.
- The provided page is a standalone three-tab tool. The implementation intentionally keeps Neki Admin's existing fixed sidebar, utility header, typography, radii, and command palette instead of replacing the current product shell.
- Upload is moved into a focused modal so file selection, people count, previews, validation, loading, failure retention, and completion can be handled without pushing the library below the fold.
- The new filter rail adds the requested all/1/2/3/4-person counts without changing or inventing a backend enum.

## Responsive checks

| Viewport | Result | Evidence |
| --- | --- | --- |
| 1440 × 1000 | Four-column pose library; fixed sidebar and header remain aligned. | `pose-admin-implementation-1440.png` |
| 1024 × 900 | Three-column library; mobile navigation replaces the sidebar; no document-level horizontal overflow. | `pose-admin-1024.png` |
| 768 × 1024 | Two-column library; all primary navigation and upload actions remain visible. | `pose-admin-768.png` |
| 390 × 844 | One-column library; filter rail scrolls horizontally; page and dialog have no document-level horizontal overflow. | `pose-admin-390.png`, `pose-upload-390.png` |

Measured `documentElement.scrollWidth === clientWidth` at 1024, 768, and 390 widths. The 390px upload dialog measured about 368px wide inside the 390px viewport.

## Interaction and state checks

- Selecting the 2-person filter reduced the visible library from eight cards to the two matching cards.
- Selecting a real JPG through the file chooser produced an image preview and enabled the upload action.
- Mock upload added one card, changed the 2-person count from two to three, selected the matching filter, and displayed a success toast.
- `state=empty` showed the pose-specific empty state and first-upload action.
- `state=error` showed the shared load error and retry action.
- The upload modal keeps selected files on failure by design; successful mock data resets on full reload as disclosed in the UI.

## Comparison history

1. First visual pass found the profile block inheriting the Ant Layout header line height, which made it 161px tall and clipped it above the 72px header.
2. The header and profile copy received explicit line heights; the measured block is now 40px high and vertically centered.
3. The first 390px pass wrapped short filter labels onto two lines.
4. Filter labels now use no-wrap text and a 100px mobile basis, leaving a clear horizontal-scroll affordance.

## Findings

No actionable P0, P1, or P2 visual or interaction issues remain in the pose-management flow.

## Follow-up polish

- P3: once the production API defines pagination, upload limits, accepted formats, and image processing, recheck large-library performance and server-reported validation copy.

## Final result

passed
