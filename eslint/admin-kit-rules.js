/**
 * V4 Stage A lint rules for app/admin (specs/bloomos-v4-product-readiness.md
 * §6: "Lint rules ban raw <table>, hand-built overlays and unlabeled inputs
 * under app/admin ... so the count only goes down").
 *
 * Each rule is a no-restricted-syntax selector. .eslintrc.js turns them on
 * for app/admin/**, minus the files in eslint/admin-kit-allowlist.json (the
 * offenders on the day the rule landed, with their count).
 * tests/admin-lint-ratchet.test.ts runs the same selectors and fails when a
 * file goes over its count, when a new file offends, or when a file drops
 * below its count without the allowlist being lowered to match. So the
 * count only ever goes down.
 *
 * Heuristics, on purpose:
 *  - raw-table: any JSX <table>. Use <DataTable> (app/admin/_components/ui).
 *  - overlay: a className string or template part holding both `fixed` and
 *    `inset-0`. Use the kit <Drawer> or <Modal>. Class strings built in a
 *    variable are not seen.
 *  - unlabeled-input: <input>, <select> or <textarea> with no aria-label,
 *    aria-labelledby, id (a <label htmlFor> can point at it) or title, not
 *    inside a <label>, not type="hidden", and no {...spread} (a kit control
 *    passes its label through). Use the kit Field family.
 */

const CONTROL = "JSXOpeningElement[name.name=/^(input|select|textarea)$/]";
// Both classes, in either order (lookaheads: esquery can't read a top-level "|").
const OVERLAY_RE = "/^(?=[\\s\\S]*\\bfixed\\b)(?=[\\s\\S]*\\binset-0\\b)/";

const RULES = {
  "raw-table": {
    selector: "JSXOpeningElement[name.name='table']",
    message: "Raw <table> in app/admin: use <DataTable> from app/admin/_components/ui (V4 §6).",
  },
  overlay: {
    selector: [
      `JSXAttribute[name.name='className'] Literal[value=${OVERLAY_RE}]`,
      `JSXAttribute[name.name='className'] TemplateElement[value.raw=${OVERLAY_RE}]`,
    ].join(", "),
    message: "Hand-built overlay (fixed inset-0): use the kit <Drawer> or <Modal> (V4 §6).",
  },
  "unlabeled-input": {
    selector:
      `${CONTROL}` +
      ":not(:has(JSXAttribute[name.name=/^(aria-label|aria-labelledby|id|title)$/]))" +
      ":not(:has(JSXAttribute[name.name='type'][value.value='hidden']))" +
      ":not(:has(JSXSpreadAttribute))" +
      ":not(JSXElement[openingElement.name.name='label'] *)",
    message: "Unlabeled form control: give it a label (kit TextField/SelectField, or aria-label) (V4 §6, WCAG 2.2 AA).",
  },
};

/** The kit's own primitives, which ARE the sanctioned table and overlays.
 *  Permanently exempt and never counted as offenders. */
const KIT_FILES = {
  "raw-table": ["app/admin/_components/ui/DataTableFrame.tsx"],
  overlay: ["app/admin/_components/ui/Drawer.tsx", "app/admin/_components/ui/Modal.tsx"],
  "unlabeled-input": [],
};

/** The no-restricted-syntax entries for a set of rule keys. */
function restrictedSyntax(keys) {
  return ["error", ...keys.map((k) => ({ selector: RULES[k].selector, message: RULES[k].message }))];
}

/** Which rule a reported message belongs to. */
function ruleForMessage(message) {
  return Object.keys(RULES).find((k) => RULES[k].message === message) ?? null;
}

module.exports = { RULES, KIT_FILES, restrictedSyntax, ruleForMessage };
