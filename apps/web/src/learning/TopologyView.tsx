import type { CSSProperties } from "react";
import { DeviceNode } from "./DeviceNode";
import type { TopologyLayout, TopologyLink } from "./topology-layout";

/**
 * WP-I correction — the network, drawn.
 *
 * ## What is drawn, and what is not
 *
 * Devices are HTML buttons (`DeviceNode`). Wires are SVG paths. The packet is
 * one absolutely-positioned HTML element. That split is deliberate and is the
 * whole accessibility strategy:
 *
 *   - everything a learner OPERATES is a native control;
 *   - everything a learner READS exists as text in the semantic account that
 *     `PacketJourney` renders around this component;
 *   - the SVG layer therefore carries nothing of its own, and is marked
 *     `aria-hidden="true"` truthfully rather than as a formality.
 *
 * Deleting the SVG would cost a learner no information. That is the test
 * CURR-011 section 14.6 implies, and it is met by construction.
 *
 * ## Geometry, not networking
 *
 * Column positions and lane depths arrive from `topology-layout.ts` already
 * decided. This file converts them to coordinates and nothing else: it does not
 * know what a VLAN is, does not read an address, and cannot tell whether
 * traffic would flow between two boxes it happens to draw side by side.
 *
 * ## Why `preserveAspectRatio="none"`
 *
 * The wire layer stretches to whatever width the topology occupies, so the
 * horizontal scale is responsive while the vertical scale stays 1:1 with the
 * CSS pixel heights the stylesheet uses. Only straight segments are drawn, so
 * non-uniform scaling changes nothing visible, and
 * `vector-effect="non-scaling-stroke"` keeps the stroke width constant at every
 * width. The three constants below are mirrored by the stylesheet, and the two
 * must agree or the wires would not meet the devices.
 *
 * ## Motion
 *
 * There is none here. The packet element carries a CSS transition, which the
 * stylesheet drops under `prefers-reduced-motion`. No branch in this file reads
 * a motion preference, so a reduced-motion learner receives identical markup,
 * identical information and identical controls.
 */

/** Vertical centre of the device band, in viewBox units and CSS pixels. */
const BAND_CENTRE = 56;

/** Height of the device band. Mirrored by `.topology-devices` min-height. */
const BAND_HEIGHT = 112;

/** Height of one routed lane. Mirrored by `.topology` padding-bottom. */
const LANE_HEIGHT = 34;

/** Horizontal centre of one column, in viewBox units. */
function columnCentre(column: number, columns: number): number {
  return ((column + 0.5) / columns) * 1000;
}

/**
 * One wire.
 *
 * Lane 0 is a straight run along the device band, which is what a link between
 * neighbouring devices looks like. Anything spanning further drops below the
 * band, crosses, and comes back up — sharp corners, because a curve under
 * non-uniform scaling is the one shape that would visibly distort.
 */
function wirePath(link: TopologyLink, columns: number): string {
  const from = columnCentre(link.fromColumn, columns);
  const to = columnCentre(link.toColumn, columns);

  if (link.lane === 0) {
    return `M ${from} ${BAND_CENTRE} H ${to}`;
  }

  const depth = BAND_HEIGHT + (link.lane - 0.5) * LANE_HEIGHT;

  return `M ${from} ${BAND_CENTRE} V ${depth} H ${to} V ${BAND_CENTRE}`;
}

function wireClassName(link: TopologyLink): string {
  if (link.current) return "topology-wire is-current";
  if (link.traversed) return "topology-wire is-traversed";
  return "topology-wire";
}

export function TopologyView({
  layout,
  selectedNodeId,
  inspectorId,
  eventToken,
  onSelect
}: {
  layout: TopologyLayout;
  selectedNodeId: string | null;
  /** The inspector panel each device button controls. */
  inspectorId: string;
  /**
   * Changes whenever something observable changed.
   *
   * Used as a React `key` on the two decorative layers so their CSS animation
   * REPLAYS — which is how a transient emphasis is triggered without any
   * JavaScript that knows about motion. The stylesheet drops the animation
   * under `prefers-reduced-motion`, and nothing here reads a motion preference,
   * so the markup and every fact are identical either way.
   *
   * Deliberately not applied to the device buttons: remounting a control would
   * throw away focus, and a learner who had tabbed to a device would lose their
   * place every time the journey advanced.
   */
  eventToken: string;
  onSelect: (nodeId: string) => void;
}) {
  // Fail closed. An unresolvable topology draws nothing and says so; it never
  // falls back to a partial picture, because a learner reasons about the
  // network they can see and a missing device changes the answer.
  if (layout.state === "unavailable") {
    return <p className="topology-unavailable">{layout.reason}</p>;
  }

  const height = BAND_HEIGHT + layout.lanes * LANE_HEIGHT;

  const frame = {
    "--tlp-topology-columns": layout.columns,
    "--tlp-topology-lanes": layout.lanes
  } as CSSProperties;

  return (
    /*
      The scroll container is the OUTER element on purpose. A narrow viewport
      cannot shrink four devices into something readable, so the topology keeps
      a minimum width and scrolls inside its own box, and the page body never
      scrolls sideways. The wire layer is positioned against the inner element,
      so the drawing and the devices scroll together and cannot drift apart.
    */
    <div className="topology-scroll">
      <div className="topology" style={frame}>
        {/*
          Decorative. Every wire it draws is also a row in the connections list
          that `PacketJourney` renders, with both endpoints in words, so
          removing this element loses a learner nothing.
        */}
        <svg
          className="topology-wires"
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 1000 ${height}`}
          preserveAspectRatio="none"
        >
          <g key={eventToken}>
            {layout.links.map((link) => (
              <path
                key={link.linkId}
                className={wireClassName(link)}
                d={wirePath(link, layout.columns)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        <div className="topology-devices">
          {layout.devices.map((device) => (
            <DeviceNode
              key={device.nodeId}
              device={device}
              selected={selectedNodeId === device.nodeId}
              panelId={inspectorId}
              onSelect={onSelect}
            />
          ))}
        </div>

        {/*
          The packet. Also decorative: where it is, and what state it is in, are
          both stated in words by the live region and by the journey account.
        */}
        {layout.packet !== null && (
          <>
            {/*
              The marker is deliberately NOT keyed. Remounting it would give
              React a fresh element starting at its destination, and the CSS
              `left` transition — the packet visibly travelling — would never
              run. Its movement is the whole point.
            */}
            <span
              className={`topology-packet is-${layout.packet.state}`}
              aria-hidden="true"
              style={
                { "--tlp-packet-column": layout.packet.column } as CSSProperties
              }
            />

            {/*
              The transient emphasis, as its own element so that keying it
              costs nothing: one calm ring at the device the traffic just
              reached. It exists only to catch peripheral vision when the
              learner's eyes are on the control they pressed.
            */}
            <span
              key={eventToken}
              className={`topology-pulse is-${layout.packet.state}`}
              aria-hidden="true"
              style={
                { "--tlp-packet-column": layout.packet.column } as CSSProperties
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
