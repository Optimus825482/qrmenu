import { Icon, type IconName } from "@/components/icons/Icon";
import type { MotionEvent, MotionKind } from "./motionModel";

/**
 * Sprites of the scene layer. Each is drawn around (0, 0); the layer moves its outer group with
 * transform and opacity only. Colours come from the tone tokens, shapes from the Icon set; no text but "+N".
 */

const Glyph = ({ name, size }: { name: IconName; size: number }) => (
  <g transform={`translate(${-size / 2} ${-size / 2})`}>
    <Icon name={name} size={size} />
  </g>
);

/** An order travelling table -> kitchen queue. */
export function OrderDot() {
  return (
    <>
      <circle r={9} className="rd-m-halo" />
      <circle r={6} className="rd-m-fill" />
    </>
  );
}

/** The tray coming back from the kitchen, or a served-order mark. */
export function Tray() {
  return (
    <>
      <rect x={-14} y={-11} width={28} height={22} rx={5} className="rd-m-card" />
      <Glyph name="utensils" size={16} />
    </>
  );
}

/** A ring: the continuous one of an open call, or the one-shot of a served order. */
export function Ring({ call }: { call?: boolean }) {
  return call ? (
    <>
      <g className="rd-m-ring">
        <circle r={15} className="rd-m-stroke" />
      </g>
      <circle r={9} className="rd-m-fill" />
      <g className="rd-m-glyph-on">
        <Glyph name="bell" size={11} />
      </g>
    </>
  ) : (
    <>
      <circle r={15} className="rd-m-stroke" />
      <Glyph name="check" size={14} />
    </>
  );
}

/** A sweep over a room cell (checked, or marked do-not-disturb). */
export function Sweep({ dnd }: { dnd?: boolean }) {
  return (
    <>
      <rect x={-24} y={-18} width={48} height={36} rx={6} className="rd-m-sweep" />
      <Glyph name={dnd ? "moon" : "check"} size={14} />
    </>
  );
}

/** A staff member moving between places. */
export function StaffDot() {
  return (
    <>
      <circle r={10} className="rd-m-fill" />
      <g className="rd-m-glyph-on">
        <Glyph name="user" size={12} />
      </g>
    </>
  );
}

/** A flying badge (a MyBar request) or the `+N` of merged events. */
export function Badge({ icon, text }: { icon?: IconName; text?: string }) {
  return (
    <g className="rd-m-badge">
      <rect x={text ? -14 : -13} y={-10} width={text ? 28 : 26} height={20} rx={10} className="rd-m-fill" />
      {icon ? (
        <g className="rd-m-glyph-on">
          <Glyph name={icon} size={13} />
        </g>
      ) : null}
      {text ? (
        <text x={0} y={4} textAnchor="middle">
          {text}
        </text>
      ) : null}
    </g>
  );
}

/** A short dash from the kitchen to the printer. */
export function Dash() {
  return <rect x={-9} y={-2.5} width={18} height={5} rx={2.5} className="rd-m-fill" />;
}

/** The warning mark that shakes on a critical stock card. */
export function Shake() {
  return (
    <>
      <circle r={12} className="rd-m-stroke" />
      <Glyph name="warning" size={14} />
    </>
  );
}

function Body({ ev }: { ev: MotionEvent }) {
  const k: MotionKind = ev.kind;
  switch (k) {
    case "order.flow":
      return ev.to ? <OrderDot /> : <Badge icon="clock" />;
    case "order.ready":
      return <Tray />;
    case "order.served":
      return <Ring />;
    case "call.ring":
      return <Ring call />;
    case "room.check":
      return <Sweep />;
    case "dnd.mark":
      return <Sweep dnd />;
    case "mybar.request":
      return <Badge icon="minibar" />;
    case "staff.move":
      return <StaffDot />;
    case "print.job":
      return <Dash />;
    case "stock.critical":
      return <Shake />;
  }
}

/** One sprite: the outer group is what the frame loop moves. */
export function Sprite({ ev, register }: { ev: MotionEvent; register(id: string, el: SVGGElement | null): void }) {
  return (
    <g
      ref={(el) => register(ev.id, el)}
      className="rd-m-sprite"
      data-kind={ev.kind}
      data-tone={ev.tone}
      data-motion-id={ev.id}
      style={{ opacity: 0 }}
    >
      <Body ev={ev} />
      {ev.more && ev.more > 0 ? (
        <g transform="translate(14 -14)">
          <Badge text={`+${ev.more}`} />
        </g>
      ) : null}
    </g>
  );
}
