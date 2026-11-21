# Authoring rules for BloomOS V4 prototype artboards (.dc.html)

Each artboard is ONE self-contained file in `project/`. Copy the structure of `project/Main.dc.html` exactly (read it first): it is the approved reference for the shell, tokens, type and component look.

## File format (each rule fails silently if broken)
- Keep `<script src="./support.js"></script>` in <head> exactly. One `<x-dc>` root containing `<helmet>` (font <link> + a <style> with only `body{margin:0}` and `a`/`a:hover` colors) and then the markup.
- End with `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":W,"height":H}}'>` holding `class Component extends DCLogic { renderVals() { return {...}; } }`. Classic JS only: no imports, no TypeScript, no render().
- `{{ path }}` holes are dotted lookups into renderVals() only. NEVER an expression. Compute everything in renderVals().
- Repeats: `<sc-for list="{{rows}}" as="r" hint-placeholder-count="4">...</sc-for>`. Branches: `<sc-if value="{{flag}}" hint-placeholder-val="{{true}}">...</sc-if>`.
- All styling is inline `style="..."`. Static colors are written literally in the markup. A style hole is only for values that vary per item (computed in renderVals()).
- Close every non-void element, quote every attribute. No <iframe>, no network except the Google Fonts css2 <link> for Instrument Sans. No emoji. Icons: inline stroke SVG with aria-hidden="true", or none.
- Copy is literal text in the markup unless it is genuinely per-row data.
- Real controls: <button type="button">, <a href="#">, <input> with <label>. aria-label on icon-only buttons. Touch targets at least 44px on phone screens, 36px on desktop toolbars.
- Links between artboards: `<a href="Other.dc.html">`.

## Two kinds of artboard
- PAGE (desktop): fluid root like Main.dc.html (flex row, wraps on narrow widths, `min-height`), `$preview` 1440 x the page's natural height. Wide tables sit in an `overflow-x: auto` box.
- PHONE: root is a fixed `width: 390px; height: 844px; overflow: hidden` box, `$preview` 390 x 844. No fake status bar. Bottom bar: Today, Work, a larger center Capture button, Fundraising, More.

## The BloomOS look (approved)
- Frame: outer background #1C1814 (espresso). Sidebar flush left, 248px, items Home, Work, Programs, Fundraising, Comms, Finance, Impact, Organization, then Inbox and Settings at the bottom. The working area is a panel with background #F7F4EE, border-radius 18px, margin 10px 10px 10px 0.
- Tokens: app bg #F7F4EE; surface #FFFDF9; tile #FBF8F2; borders #E3D9CB (subtle) and #CDBEAA (strong); text #29241F, secondary #746C63; accent fill #C96B38; accent as text or as a button fill under white text #9D532C; accent soft #F5E5DB with text #7D4223; success #32745B on #E2EFE8; warning text #965C1C on #F5EAD6; danger text #AE4339 on #F5E2E0. Radius 9px controls, 15px panels, 18px modals. No shadows. Font: Instrument Sans 400/500/600/700. Page title 28px/600; section title 17 to 20px/600; body 14px; small 12 to 13px.
- Accent discipline: the terracotta fill appears ONLY on the one primary action per screen, the active nav marker and active filters. Everything else is neutral.
- Structured calm: dense but quiet. One page header (title left, ONE primary action right, everything else in a "More actions" button). No card-in-card nesting, no decoration.
- Numbers follow the Stripe standard: every key figure has a small line under it saying where it comes from and how fresh it is (for example "From bank balance, updated today 6:02am" or "42 gifts, as of now"). Distinguish missing from zero.
- Every list row, card and panel ends in a next step or an action. Late items use the danger text color and say how late.

## Content rules
- All people, orgs and amounts are made up. Reuse the cast from Main.dc.html where it fits (Dana Whitfield, Harlow Family Fund, Priya Raman, Northgate Credit Union, Marcus Oyelaran, Elena Brandt, Tidewater Community Trust, Jon and Mei Castellano, Okafor Family). The signed-in user is "Remi" with initials RS. The org is "Ambition Angels (demo)".
- No em dashes anywhere. No lorem ipsum. Plain, direct labels a small nonprofit's ED would understand. No jargon ("weighted pipeline", "entity", "obligation").
- Do not invent features BloomOS does not have and the brief does not call for. Read the brief and audit files named in your task for what exists and what is planned.

## What to hand back
Write ONLY your named file(s) under `project/`. Do not edit canvas.json, Main.dc.html, Pipeline.dc.html or another agent's files. Do not publish anything. Final message: the files you wrote, each one's natural width and height for `$preview`, and one line per screen on the design choices you made.
