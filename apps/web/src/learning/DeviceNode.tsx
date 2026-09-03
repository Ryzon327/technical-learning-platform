import type { CSSProperties } from "react";
import { DeviceSymbol } from "./DeviceSymbol";
import type { TopologyDevice } from "./topology-layout";

/**
 * WP-I, corrected by WP-J Module 1 — one device in the topology, as a real
 * control.
 *
 * ## Why this is a `<button>` and not an SVG shape
 *
 * A device is something the learner selects in order to inspect it, so it has
 * to be operable, focusable, announced and reachable by keyboard. A native
 * button is all four for free. An SVG `<rect>` given `tabindex` and a synthetic
 * key handler is an imitation of one, and CURR-011 section 14.4 is explicit
 * that keyboard operability alone is not sufficient — the control must also be
 * perceivable and interpretable, which is exactly what native semantics carry.
 *
 * That is why the drawn layer in `TopologyView` contains only the wires and is
 * marked `aria-hidden`: nothing a learner must operate lives inside it.
 *
 * ## The card is placed, and is exactly the size it was given
 *
 * `style` carries the box `topology-layout.ts` computed: position and size,
 * both in the topology's own coordinate space. This component chooses none of
 * it, and it must not grow past what it is given — the wires are drawn in the
 * band between two rows, and a card taller than its box would be drawn across
 * them. The layout sizes the box from the number of facts on the face, and the
 * stylesheet gives every part of the face a fixed height so the two agree.
 *
 * ## Progressive disclosure
 *
 * The face of a device shows its symbol, its category, its name, its state, and
 * the facts the SOURCE flagged as prominent — each on its own line, beside the
 * port it belongs to. It does NOT show every attribute of every interface; that
 * dump is what made the earliest presentation unreadable. The rest appears when
 * the learner selects the device, in the inspector, and again in the complete
 * device listing.
 *
 * Which facts reach the face is an authoring decision carried through the
 * observation model, never a judgement made here. This component cannot tell a
 * VLAN from an address and must not learn to: it renders a label and a value.
 * That is what lets a learner follow VLAN 10 from PC-A to the access port to
 * the trunk to the router subinterface without any code understanding that a
 * VLAN is a thing.
 *
 * ## Recognition before vocabulary
 *
 * The face leads with a SYMBOL, then the category word, then the device's name.
 * That order is the one the course teaches in: a beginner recognises a shape
 * before they can read "switch", and Mission 1 is built on looking at what a
 * device is attached to before being handed its name.
 *
 * The symbol is chosen from the authored `role` and from nothing else — see
 * `DeviceSymbol`. This component still cannot tell a VLAN from an address and
 * still must not learn to.
 *
 * ## State is never colour alone
 *
 * `stateLabel` is authored wording from the layout module and is rendered as
 * text for EVERY state, alongside the class that colours them. CURR-011 section
 * 14.7: a consequence is never carried by colour or motion by itself.
 *
 * Two states used to render no text at all. `current`, `stopped` and
 * `confirmed` were captioned; `visited` and `idle` were left to the background
 * and the border, which made "the traffic passed through here" a colour-only
 * claim — precisely what section 14.7 forbids, and precisely the fact the UAT
 * runbook asks a reviewer to confirm on the Printer and Router-1.
 *
 * Both now carry their wording. `visited` shows it, because a device the
 * traffic crossed is a fact worth reading. `idle` carries it for assistive
 * technology only: "Not involved so far" repeated across five quiet devices is
 * noise on the face and information in the accessible name, so it is placed
 * where it is worth having and hidden where it is not. Nothing is conveyed by
 * colour in either case — the distinction is the presence of a caption, not its
 * hue.
 */
export function DeviceNode({
  device,
  selected,
  panelId,
  style,
  onSelect
}: {
  device: TopologyDevice;
  selected: boolean;
  /** The inspector this button controls, for `aria-controls`. */
  panelId: string;
  /** The box the layout computed. Position and size, never chosen here. */
  style: CSSProperties;
  onSelect: (nodeId: string) => void;
}) {
  /*
    One line per authored fact, carrying the port it belongs to.

    A port appears here only when the SOURCE flagged a fact on it as prominent.
    That is what keeps ROAS's "follow VLAN 10 from PC-A to the access port to
    the trunk" readable at a glance, and it is what stops Module 1's Switch-1
    printing four bare port chips that say nothing the inspector does not say
    better. An unflagged port is not hidden — every port and every attribute is
    listed in full when the device is selected, and again in the complete device
    listing.

    One line per fact, rather than several facts wrapped into one row, is also
    what keeps the card's height PREDICTABLE: the layout computes the box from
    exactly this count, and a row that wrapped would make the card taller than
    the box the wires were drawn around.
  */
  const faceFacts = device.ports.flatMap((port) =>
    port.facts.map((fact) => ({ port, fact }))
  );

  return (
    <button
      type="button"
      className={`topology-device is-${device.state}${selected ? " is-selected" : ""}`}
      style={style}
      aria-expanded={selected}
      aria-controls={panelId}
      onClick={() => onSelect(device.nodeId)}
    >
      {/*
        Decorative, and honestly so: the category it draws is the very next
        thing on the face, in words.
      */}
      <span className="topology-device-figure">
        <DeviceSymbol role={device.role} />
      </span>

      <span className="topology-device-role">{device.roleLabel}</span>
      <span className="topology-device-name">{device.label}</span>

      <span
        className={
          device.state === "idle"
            ? "topology-device-state is-unreached"
            : "topology-device-state"
        }
      >
        {/*
          The delivery mark.

          Founder UAT asked for a delivery that feels finished. The mark is
          DECORATIVE and additive: `stateLabel` beside it already says
          "Delivered here", and the green treatment already says it a third
          way, so a learner who cannot see either the colour or the glyph still
          reads the fact. It is drawn for exactly one state, so it cannot come
          to mean "this device is fine".
        */}
        {device.state === "confirmed" && (
          <span className="topology-device-mark" aria-hidden="true">
            ✓
          </span>
        )}
        {device.stateLabel}
      </span>

      {faceFacts.length > 0 && (
        <span className="topology-device-ports">
          {faceFacts.map(({ port, fact }) => (
            <span
              key={`${port.interfaceId} ${fact.label}`}
              className="topology-port-row"
            >
              <span className="topology-port">{port.label}</span>
              {/*
                Label and value both, always. A value alone ("10") means
                nothing, and inferring the label from the value would be the
                domain knowledge this component must not have. No hover, no
                title: everything is on the face and in the accessible name.
              */}
              <span className="topology-fact">
                <span className="topology-fact-label">{fact.label}</span>{" "}
                {fact.value}
              </span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
