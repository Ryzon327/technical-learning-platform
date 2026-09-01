import type { TopologyDevice } from "./topology-layout";

/**
 * WP-I correction — one device in the topology, as a real control.
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
 * ## Progressive disclosure
 *
 * The face of a device shows its name, its role, its ports, and the facts the
 * SOURCE flagged as prominent. It does NOT show every attribute of every
 * interface — that dump is what made the previous presentation unreadable. The
 * rest appears when the learner selects the device, in the inspector.
 *
 * Which facts reach the face is an authoring decision carried through the
 * observation model, never a judgement made here. This component cannot tell a
 * VLAN from an address and must not learn to: it renders a label and a value.
 * That is what lets a learner follow VLAN 10 from PC-A to the access port to
 * the trunk to the router subinterface without any code understanding that a
 * VLAN is a thing.
 *
 * ## State is never colour alone
 *
 * `stateLabel` is authored wording from the layout module and is rendered as
 * text for the current, stopped and confirmed states, alongside the class that
 * colours them. CURR-011 section 14.7: a consequence is never carried by colour
 * or motion by itself.
 */
export function DeviceNode({
  device,
  selected,
  panelId,
  onSelect
}: {
  device: TopologyDevice;
  selected: boolean;
  /** The inspector this button controls, for `aria-controls`. */
  panelId: string;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`topology-device is-${device.state}${selected ? " is-selected" : ""}`}
      style={{ gridColumn: device.column + 1 }}
      aria-expanded={selected}
      aria-controls={panelId}
      onClick={() => onSelect(device.nodeId)}
    >
      <span className="topology-device-role">{device.roleLabel}</span>
      <span className="topology-device-name">{device.label}</span>

      {device.state !== "idle" && device.state !== "visited" && (
        <span className="topology-device-state">{device.stateLabel}</span>
      )}

      {device.ports.length > 0 && (
        <span className="topology-device-ports">
          {device.ports.map((port) => (
            <span key={port.interfaceId} className="topology-port-row">
              <span className="topology-port">{port.label}</span>
              {/*
                Label and value both, always. A value alone ("10") means
                nothing, and inferring the label from the value would be the
                domain knowledge this component must not have. No hover, no
                title: everything is on the face and in the accessible name.
              */}
              {port.facts.map((fact) => (
                <span key={fact.label} className="topology-fact">
                  <span className="topology-fact-label">{fact.label}</span>{" "}
                  {fact.value}
                </span>
              ))}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
