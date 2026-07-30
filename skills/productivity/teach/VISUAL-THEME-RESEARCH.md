# Readable dark teaching pages: research notes

## Question

What dark presentation should the `teach` skill use when the goal is sustained, easy reading rather than decorative visual impact?

## Final decision

The selected production direction is the original Round 1 `A - Technical manual` prototype without the later maximum-contrast blend. Its defining metrics are a flat `#10151B` page, `#E8EDF2` body text at approximately `15.57:1` contrast, `18px` body text, `1.62` line height, a `66ch` reading measure, and a compact contents rail on desktop.

## Conclusions used by the prototype

- A dark theme is a user preference, not a general readability advantage. Positive polarity often improves acuity and proofreading, especially for smaller text, so a dark default should compensate with larger text, high neutral contrast, and a future user override.
- Use solid backgrounds behind reading content. Structure should come from headings, spacing, weight, rules, and restrained semantic color rather than grids, glows, gradients, or illustrations.
- Keep body text at `18-20px`, line height around `1.55-1.66`, and prose measure around `58-66ch`. These are evidence-informed prototype ranges, not universal optima.
- Target at least `7:1` for body text and at least `4.5:1` for secondary text. Avoid thin strokes even when the nominal color ratio passes.
- Use real semantic headings and no more than two visual cues per heading level. Do not use cards or colored text as a substitute for information hierarchy.
- Underline links, provide visible keyboard focus, preserve meaning without color, and let the page reflow at a `320px` CSS viewport.
- The WCAG text-spacing values are override tests, not mandatory authored defaults. The layout must survive them without clipping or overlap.

## Evidence

### Display polarity

Piepenbrock et al. found positive polarity improved visual acuity and proofreading for younger and older adults, while reading speed and reported eyestrain did not differ. A follow-up found the positive-polarity advantage grew as text became smaller. This prototype therefore tests dark pages only at relatively large body sizes and does not claim dark mode is healthier or objectively easier.

- [Positive display polarity is advantageous for both younger and older adults](https://doi.org/10.1080/00140139.2013.790485)
- [Positive display polarity is particularly advantageous for small character sizes](https://doi.org/10.1177/0018720813515509)
- [When black meets white: the relations between visual acuity and contrast polarity](https://doi.org/10.1080/00140130802641635)

### Text size, line spacing, and measure

Controlled reading studies disagree on one perfect line length: longer lines can be faster, while moderate lines are often easier or support comprehension. The safe design decision is a constrained range rather than a claimed optimum. A controlled eye-tracking study found readability improvements as text size increased through the middle of its tested range, supporting larger-than-default lesson text.

- [The influence of reading speed and line length on the effectiveness of reading from screen](https://doi.org/10.1006/ijhc.2001.0458)
- [The Effect of Line Length on Reading Online News](https://journals.uc.edu/index.php/vl/article/view/5671)
- [Make It Big! The Effect of Font Size and Line Spacing on Online Readability](https://www.changedyslexia.org/publications/pdfs/2016-CHI-Make%20It%20Big%20The%20Effect%20of%20Font%20Size.pdf)

### Hierarchy

Typographic hierarchy can support learning when ranks use a restrained set of cues. W3C guidance also requires heading structure to communicate the organization of a page, not merely decorate it.

- [Typographic Cues As an Aid to Learning from Textbooks](https://journals.uc.edu/index.php/vl/article/view/5483)
- [W3C: Headings](https://www.w3.org/WAI/tutorials/page-structure/headings/)

### Accessibility constraints

WCAG 2.2 sets `4.5:1` as the minimum contrast for normal text and `7:1` as the enhanced target. Its visual-presentation guidance supports user-selectable colors, lines no wider than 80 characters, non-justified text, spacing controls, and resize without horizontal page scrolling. Reflow requires content to remain usable at a width equivalent to `320px`, and text-spacing overrides must not clip or overlap content.

- [WCAG 2.2: Contrast (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html)
- [WCAG 2.2: Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
- [WCAG 2.2: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [WCAG 2.2: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [WCAG 2.2: Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

## Prototype constraints

All variants use the same real lesson sample and:

- have a flat, opaque page background;
- use neutral off-white body text;
- reserve accent colors for links, labels, warnings, and focus;
- use body text from `18px` to `20px`;
- constrain prose between `58ch` and `66ch`;
- use line heights from `1.58` to `1.66`;
- support keyboard switching and stable `?variant=` URLs;
- collapse to a single reading column on narrow screens;
- include no motion.

The prototype deliberately varies type family, hierarchy, density, navigation, and grouping. It does not vary only color.
