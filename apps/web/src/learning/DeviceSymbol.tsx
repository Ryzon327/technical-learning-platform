import type { ObservationNodeRole } from "@tlp/shared-types";

/**
 * WP-J Module 1 — the device symbol set.
 *
 * ## Why symbols exist at all
 *
 * A beginner reading their first topology cannot yet read the words. They can
 * read SHAPE. Before a learner knows what a switch is, a topology drawn from
 * four distinguishable silhouettes has already taught them that a network is
 * made of different KINDS of thing that do different jobs — which is the
 * proposition Mission 1 spends four steps establishing in prose.
 *
 * A topology of five identical rectangles teaches the opposite, and it teaches
 * it faster than the prose can correct it. That is the sense in which a visual
 * is instruction: it makes a claim whether or not anybody authored one.
 *
 * ## Where a symbol comes from, and where it must never come from
 *
 * From `ObservationNodeRole`, which is authored, closed, and documented as
 * presentation-only. Nothing here reads a label, an interface, an attribute or
 * a device name. A renderer that recognised the word "Printer" would be correct
 * for this course's wording and silently wrong for the next one, and it would
 * be the same defect `ObservationAttribute.prominent` exists to prevent.
 *
 * The mapping is total over the union, so adding a role is a compile error
 * here until a symbol is drawn for it. That is deliberate: a new category with
 * no silhouette would fall back to looking like an existing one, which is a
 * misleading visual rather than a missing one.
 *
 * ## What a symbol may claim
 *
 * Category, and nothing else. None of these shapes indicates state, direction,
 * traffic, reachability or health — those are the journey's business, they are
 * carried in words elsewhere, and a symbol that changed with them would be
 * asserting a second networking model in pictures.
 *
 * ## Why line art, and why `currentColor`
 *
 * Every symbol is unfilled stroke work on a 24-unit grid at a single weight, so
 * the set reads as one drawn system rather than an icon library sampled at
 * random. Inheriting `currentColor` means a symbol is legible in both themes
 * and in every device state without a palette of its own, and it means the
 * symbol can never become the only carrier of a state: it is the same colour as
 * the text beside it.
 *
 * ## Accessibility
 *
 * `aria-hidden`, always. The category is already text — `DeviceNode` renders
 * the role word, the inspector repeats it, and the authored text equivalent
 * describes the whole network. These shapes add recognition for people who can
 * see them and remove nothing from anybody who cannot. Deleting this file would
 * cost a learner no fact.
 */

/**
 * One drawn silhouette. Unfilled, single weight, 24-unit grid.
 *
 * Exhaustive over the union by construction: the `never` arm stops compiling
 * the moment a role is added without a shape, which is what makes the "no
 * category falls back to another category's symbol" claim above true rather
 * than aspirational.
 */
function symbolPaths(role: ObservationNodeRole) {
  if (role === "switch") {
    // A wide, shallow chassis whose defining feature is a ROW OF PORTS.
    //
    // Port density is the whole point: Mission 1 teaches that "a device built
    // to hold many of these connections usually calls each of them a port", and
    // Mission 2 turns on a switch having several of them and choosing between
    // them. The silhouette states that before either mission says it.
    return (
      <>
        <rect x="2.5" y="7.5" width="19" height="9" rx="1.75" />
        <path d="M6 11v2M9 11v2M12 11v2M15 11v2M18 11v2" />
      </>
    );
  }

  if (role === "router") {
    // The same chassis family as the switch — they are both boxes in a rack —
    // separated by what leaves it: two paths departing in OPPOSITE directions.
    //
    // Mission 1 establishes the router as the device with a second attachment
    // to something that is not part of this network. Divergence is that idea as
    // a shape. It says nothing about routing, which Mission 1 explicitly does
    // not teach and this symbol must not imply.
    return (
      <>
        <rect x="2.5" y="10.5" width="19" height="8" rx="1.75" />
        <path d="M8 8V5.5h8V8" />
        <path d="M5.5 5.5 8 8M18.5 5.5 16 8" />
      </>
    );
  }

  if (role === "printer") {
    // Feed above, body, and a sheet emerging at the front.
    //
    // The one end device a beginner recognises instantly without being told, so
    // it carries the lesson that a host need not be a computer somebody sits
    // at — Mission 1 step 2 makes exactly that claim in prose.
    return (
      <>
        <path d="M7 8.5V4.5h10v4" />
        <rect x="3.5" y="8.5" width="17" height="7" rx="1.75" />
        <path d="M7 13.5h10v6H7z" />
        <path d="M9.5 16h5" />
      </>
    );
  }

  if (role === "host") {
    // A screen on a stand.
    //
    // The general end device, and deliberately drawn as the ORDINARY one: it is
    // what a learner already pictures when they hear "a machine someone uses",
    // and Mission 1 widens the word from there rather than starting wide.
    return (
      <>
        <rect x="3" y="4.5" width="18" height="11.5" rx="1.75" />
        <path d="M12 16v3M8.5 19.5h7" />
      </>
    );
  }

  const unreachable: never = role;
  return unreachable;
}

export function DeviceSymbol({ role }: { role: ObservationNodeRole }) {
  return (
    <svg
      className="topology-device-symbol"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {symbolPaths(role)}
    </svg>
  );
}
