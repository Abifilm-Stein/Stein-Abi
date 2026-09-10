import { Component, input } from '@angular/core';

/**
 * SteinAbi mark.
 *
 * Rebuilt as inline SVG from the supplied artwork: six rectangles, so it
 * scales without artefacts, needs no extra request, and can take its colour
 * from the surrounding text. If the original vector file turns up, drop it in
 * `public/` and swap this component's body for an <img> -- the API stays the
 * same.
 *
 * Fill is `currentColor` on purpose: the header sets the brand green via a
 * token, which keeps the mark visible when the palette flips in dark mode.
 */
@Component({
  selector: 'app-logo',
  template: `
    <svg
      viewBox="0 0 300 100"
      fill="currentColor"
      [attr.role]="label() ? 'img' : 'presentation'"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      <!-- Left cluster: three uprights of differing height. -->
      <rect x="4" y="44" width="26" height="48" />
      <rect x="38" y="66" width="26" height="26" />
      <rect x="72" y="18" width="20" height="74" />

      <!-- Right cluster: three horizontal bars. -->
      <rect x="104" y="6" width="192" height="24" />
      <rect x="104" y="40" width="168" height="24" />
      <rect x="160" y="70" width="112" height="22" />
    </svg>
  `,
  host: { class: 'block' },
})
export class Logo {
  /**
   * Accessible name. Leave empty when adjacent text already names the link,
   * so screen readers do not announce "SteinAbi SteinAbi".
   */
  readonly label = input('');
}
