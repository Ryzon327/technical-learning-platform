import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DeviceNode } from "./DeviceNode";
import { fitTopologyScale } from "./topology-layout";
import type { TopologyDevice, TopologyLayout, TopologyLink } from "./topology-layout";

/**
 * WP-I, corrected by WP-J Module 1 — the network, drawn.
 *
 * ## What is drawn, and what is not
 *
 * Devices are HTML buttons (`DeviceNode`). Wires are SVG paths. The traffic
 * marker is one absolutely-positioned HTML element. That split is deliberate
 * and is the whole accessibility strategy:
 *
 *   - everything a learner OPERATES is a native control;
 *   - everything a learner READS exists as text — in the semantic account that
 *     `PacketJourney` renders around this component, and, for the ARRANGEMENT
 *     itself, in the description this component renders for assistive
 *     technology;
 *   - the SVG layer therefore carries nothing of its own, and is marked
 *     `aria-hidden="true"` truthfully rather than as a formality.
 *
 * ## This component computes no geometry
 *
 * Every coordinate arrives from `topology-layout.ts` already decided: each
 * device's box, each wire's corner points, the marker's position, and the size
 * of the canvas. This file positions elements at numbers it is given.
 *
 * That is the correction Founder UAT forced. The previous revision put devices
 * in a CSS grid and drew wires into an SVG that scaled independently with
 * `preserveAspectRatio="none"` — two coordinate systems that agreed only by
 * arithmetic kept in step by hand, in a component and a stylesheet. The wires
 * met the cards when the constants happened to agree and drifted when they did
 * not, and the whole picture was locked into one horizontal band because a grid
 * row was the only thing both systems could describe.
 *
 * There is now ONE coordinate space. The SVG is the same width and height as
 * the canvas in CSS pixels, with a matching `viewBox`, so its units are CSS
 * pixels and the scale is 1:1 in both axes. A wire cannot drift off a device,
 * because both are placed from the same numbers.
 *
 * ## Geometry, not networking
 *
 * Nothing here knows what a VLAN is, reads an address, or can tell whether
 * traffic would flow between two boxes it happens to draw near each other.
 *
 * A group boundary is drawn only where an author declared one, and around
 * exactly the devices the author put in it. This file does not decide who
 * belongs together and has nothing to decide it from: it renders a rectangle
 * and a caption the layout computed from authored membership. A group is not a
 * subnet, a VLAN or a broadcast domain, and nothing here reads one to decide
 * anything at all.
 *
 * ## Painting order, and why it is the accessibility story too
 *
 * Boundaries first, then wires, then cards, then the ring, then the marker.
 * A boundary is a FIELD behind the drawing, so it can never hide a wire, cover
 * a device, or sit over the traffic marker — which was a Founder requirement
 * rather than a preference. Every boundary is `aria-hidden`, because the same
 * membership is stated in words in the description above it.
 *
 * ## The marker, and the ring
 *
 * They are different claims and are drawn as different things.
 *
 *   `.topology-packet`  information IN TRANSIT. It sits on a wire, clear of
 *                       every card — never over a device's name, category,
 *                       interface facts, symbol or the button itself.
 *   `.topology-pulse`   the device that has the traffic NOW. A ring around
 *                       that card, which is device state rather than traffic.
 *
 * Collapsing the two is what put a dot on top of PC-A's text at Founder UAT.
 *
 * ## Motion
 *
 * There is none here. The marker carries a CSS transition, which the stylesheet
 * drops under `prefers-reduced-motion`. No branch in this file reads a motion
 * preference, so a reduced-motion learner receives identical markup, identical
 * information and identical controls.
 */

function wireClassName(link: TopologyLink): string {
  if (link.current) return "topology-wire is-current";
  if (link.traversed) return "topology-wire is-traversed";
  return "topology-wire";
}

function deviceStyle(device: TopologyDevice): CSSProperties {
  return {
    left: `${device.box.x}px`,
    top: `${device.box.y}px`,
    width: `${device.box.width}px`,
    height: `${device.box.height}px`
  };
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
  /*
    How much room the drawing has been given.

    Measured rather than assumed, because the lesson column is not a fixed
    width: it changes with the viewport, with the workspace layout, and with
    the browser's own zoom. `ResizeObserver` is the only honest source, and the
    hook runs before the early return below so the hook order never changes.

    `null` until the first measurement, which renders at the authored size for
    one frame. That is deliberate: guessing a width would make the drawing jump
    when the guess turned out to be wrong.
  */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const element = boxRef.current;
    if (element === null) return;

    if (typeof ResizeObserver === "undefined") {
      setAvailable(element.clientWidth);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) setAvailable(width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale =
    layout.state === "available" && available !== null
      ? fitTopologyScale(layout.frame, available)
      : 1;

  // Fail closed. An unresolvable topology draws nothing and says so; it never
  // falls back to a partial picture, because a learner reasons about the
  // network they can see and a missing device changes the answer.
  if (layout.state === "unavailable") {
    return <p className="topology-unavailable">{layout.reason}</p>;
  }

  /*
    The device the traffic is at.

    Every marker in a stage is anchored at the SAME device — a stage happens at
    one place, even when the author says several links were busy leaving it —
    so the first marker names it and the ring is drawn once.
  */
  const anchorNodeId = layout.packets[0]?.nodeId;
  const currentDevice =
    anchorNodeId === undefined
      ? undefined
      : layout.devices.find((device) => device.nodeId === anchorNodeId);

  const frame = {
    width: `${layout.frame.width}px`,
    height: `${layout.frame.height}px`,
    transform: `scale(${scale})`,
    transformOrigin: "top left"
  } as CSSProperties;

  // The scaled drawing still has to occupy the right amount of vertical space.
  // A CSS transform does not change layout size, so the box the drawing sits in
  // is given the scaled height explicitly — otherwise a downscaled picture
  // leaves a gap beneath it exactly as tall as the space it saved.
  const box = {
    height: `${Math.ceil(layout.frame.height * scale)}px`
  } as CSSProperties;

  return (
    /*
      The drawing is SCALED to fit the space it is given, and scrolls only below
      the readable floor (`TOPOLOGY_MIN_SCALE`).

      The earlier ruling was the opposite — cards never shrink, and a wide
      drawing scrolls sideways. Founder UAT overruled it: on Missions 4, 6 and
      8 the far network sat off the right-hand edge, and the reviewer was
      reconstructing the topology from memory rather than reasoning about it.
      Horizontal scrolling is not a way of seeing a network; it is a way of
      seeing half of one at a time.

      Scaling is uniform, so every relationship in the picture survives. The
      scale itself is decided by `fitTopologyScale`, which is a pure function of
      two box sizes and is asserted over the real authored journeys.
    */
    <div className="topology-scroll" ref={boxRef} style={box}>
      <div className="topology" style={frame}>
        {/*
          The arrangement, in words.

          The rows and the branches ARE information — that is the whole point of
          the correction — so they cannot be available only to people who can
          see them. Visually hidden because the picture states the same thing to
          anyone looking at it.
        */}
        <p className="topology-description">{layout.description}</p>

        {/*
          The authored groups, drawn as fields behind everything else.

          Decorative, and honestly so: the description above states the same
          membership in words, and it states it from the same authored field.
          Removing these elements would cost a learner no fact.
        */}
        {layout.groups.map((group) => (
          <span
            key={group.groupId}
            className="topology-group"
            aria-hidden="true"
            style={{
              left: `${group.box.x}px`,
              top: `${group.box.y}px`,
              width: `${group.box.width}px`,
              height: `${group.box.height}px`
            }}
          >
            <span
              className="topology-group-label"
              style={{
                left: `${group.labelAt.x - group.box.x}px`,
                top: `${group.labelAt.y - group.box.y}px`
              }}
            >
              {group.label}
            </span>
          </span>
        ))}

        {/*
          Decorative. Every wire it draws is also a row in the connections list
          that `PacketJourney` renders, with both endpoints in words, and the
          description above says which pairs are joined.
        */}
        <svg
          className="topology-wires"
          aria-hidden="true"
          focusable="false"
          width={layout.frame.width}
          height={layout.frame.height}
          viewBox={`0 0 ${layout.frame.width} ${layout.frame.height}`}
        >
          <g key={eventToken}>
            {layout.links.map((link) => (
              <path
                key={link.linkId}
                className={wireClassName(link)}
                d={link.path}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/*
              The wire to a network past the edge of the drawing (WP-NF-NT1B).

              A separate list, and a separate class, because it can carry no
              journey state: nothing traverses it, nothing is current on it,
              and no marker rides it. `wireClassName` is not used here and has
              nothing to say about it.
            */}
            {layout.externalNetworks.map((network) => (
              <path
                key={network.networkId}
                className="topology-wire topology-wire-external"
                d={network.path}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        {/*
          A network that continues past the edge of the drawing.

          Drawn as a plate rather than a card, because it is not equipment: no
          category word, no interfaces, no facts, no state, and no button —
          there is nothing to inspect, and making it selectable would offer a
          learner an inspector for something that is not a device.

          `aria-hidden`, like the wires and the group boundaries: the
          arrangement description above already states the same relationship in
          words, from the same authored field, so a screen reader is told it
          once rather than twice.
        */}
        {layout.externalNetworks.map((network) => (
          <span
            key={network.networkId}
            className="topology-external-network"
            aria-hidden="true"
            style={{
              left: `${network.box.x}px`,
              top: `${network.box.y}px`,
              width: `${network.box.width}px`,
              height: `${network.box.height}px`
            }}
          >
            {network.label}
          </span>
        ))}

        {/*
          Authored port labels, beside the connections they name.

          Founder UAT: a learner should not have to open an inspector to find
          out which port a device is plugged into, because the instruction says
          things like "PC-A's connection leads to Switch-1" and the diagram is
          where that has to be legible.

          `aria-hidden`, like the wires: the arrangement description above
          already names every flagged port in words, so a screen reader gets
          the same fact from one place rather than from scattered fragments.

          Which ends are labelled is the AUTHOR's decision, carried on the
          interface. This component draws the list it is given and chooses
          nothing.
        */}
        {layout.portLabels.map((port) => (
          <span
            key={`${port.linkId} ${port.interfaceId}`}
            className="topology-port-label"
            aria-hidden="true"
            style={{ left: `${port.at.x}px`, top: `${port.at.y}px` }}
          >
            {port.text}
          </span>
        ))}

        {layout.devices.map((device) => (
          <DeviceNode
            key={device.nodeId}
            device={device}
            selected={selectedNodeId === device.nodeId}
            panelId={inspectorId}
            style={deviceStyle(device)}
            onSelect={onSelect}
          />
        ))}

        {/*
          The ring around the device that has the traffic now.

          Device state, not traffic: it is drawn on the CARD, and it says "the
          journey is here". Keyed, so its animation replays on every observable
          change, and it is the only thing that does.
        */}
        {currentDevice !== undefined && layout.packets[0] !== undefined && (
          <span
            key={eventToken}
            className={`topology-pulse is-${layout.packets[0].state}`}
            aria-hidden="true"
            style={deviceStyle(currentDevice)}
          />
        )}

        {/*
          The traffic markers. Also decorative: where they are, and what state
          they are in, are both stated in words by the live region and by the
          journey account.

          Usually one. An authored stage may say several links were carrying
          something at the same moment, and then there is one marker per link,
          all leaving the same device together — which is what makes one switch
          action producing copies look like one event instead of a queue.

          Identity is the LINK, not the position in the list. Keying by index
          would let React reuse a marker for a different link on the next
          reveal, and the CSS transition would then animate it sideways from
          one wire to another — movement the journey never made. Keying by
          `linkId` keeps each marker attached to its own wire across reveals,
          so it travels along it and nowhere else.

          Deliberately NOT keyed on the event token. Remounting would give
          React a fresh element already at its destination, and the transition
          — the marker visibly travelling — would never run.
        */}
        {layout.packets.map((marker, index) => {
          /* ---------------------------------------------------------- *
              A marker that RIDES THE WIRE.

              Founder UAT, third round: "traffic must follow the
              physical/authored line continuously ... it must NOT jump directly
              between node centers, skip bends, teleport between disconnected
              visual coordinates, leave the actual wire."

              The previous marker was placed at a point and moved by a CSS
              transition on `left`/`top`. A transition interpolates in a
              STRAIGHT LINE between two positions, so on any wire with a bend
              the marker cut the corner and travelled through empty space
              rather than along the link. That is the defect.

              This uses `offset-path`, given THE SAME `d` STRING the SVG uses
              for that link — not a copy of the geometry and not a
              recomputation of it, but the identical string, carried on the
              packet by the layout. Every bend is followed because the browser
              walks the same path. There are no animation coordinates to guess.

              `offset-distance` runs 0% to 100% along it, or in reverse when
              the authored direction is the other way, so an outbound leg and
              its return visibly travel opposite ways on the same wire.

              It LOOPS while the stage is current, which is what makes the
              current leg readable without prose. One element per active wire,
              keyed by `linkId`, so looping cannot accumulate nodes; the
              animation is pure CSS, so there is no timer to leak.
           * ---------------------------------------------------------- */
          const travelling = marker.state === "moving" && marker.path !== null;

          const style: CSSProperties = travelling
            ? ({
                offsetPath: `path("${marker.path ?? ""}")`,
                offsetRotate: "0deg",
                animationDirection: marker.travelsToEnd ? "normal" : "reverse",
                left: "0px",
                top: "0px"
              } as CSSProperties)
            : { left: `${marker.at.x}px`, top: `${marker.at.y}px` };

          return (
            <span
              key={marker.linkId ?? `parked-${index}`}
              className={`topology-packet is-${marker.state}${
                travelling ? " is-travelling" : ""
              }`}
              aria-hidden="true"
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}
