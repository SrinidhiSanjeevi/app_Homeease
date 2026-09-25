import React from "react";

// Google Material Symbols (Rounded) — loaded from Google Fonts in index.html.
// <Icon name="star" filled size={18} /> renders the "star" glyph.
export default function Icon({ name, size = 20, color, filled = false, weight = 400, spin = false, style, className = "", ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-rounded${spin ? " icon-spin" : ""}${className ? ` ${className}` : ""}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        color,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`,
        ...style,
      }}
      {...rest}
    >
      {name}
    </span>
  );
}

// Drop-in named icons so pages keep familiar component names
// (<Star />, <Clock />…) while rendering Material Symbols.
// Accepts the props the pages already pass: size, color, fill, stroke, style.
const make = (glyph, defaults = {}) => {
  // Extra props (onClick, title, role, aria-*) are passed through — they
  // used to be dropped, which made clickable icons (rating stars) dead.
  function NamedIcon({ size = 20, color, fill, stroke, strokeWidth, style, className, ...rest }) {
    const isFilled = defaults.filled || (fill && fill !== "none");
    return (
      <Icon
        name={glyph}
        size={size}
        color={color || (isFilled && fill !== true ? fill : undefined) || stroke}
        filled={Boolean(isFilled)}
        weight={strokeWidth && strokeWidth > 2 ? 600 : 400}
        spin={defaults.spin}
        style={style}
        className={className}
        {...rest}
      />
    );
  }
  NamedIcon.displayName = `Icon(${glyph})`;
  return NamedIcon;
};

export const Home = make("home");
export const Calendar = make("calendar_month");
export const CalendarCheck = make("event_available");
export const User = make("person");
export const Users = make("groups");
export const ShieldAlert = make("emergency_home");
export const ShieldCheck = make("verified_user");
export const BadgeCheck = make("verified");
export const LogOut = make("logout");
export const Sparkles = make("workspace_premium");
export const Lock = make("lock");
export const KeyRound = make("key");
export const Mail = make("mail");
export const Search = make("search");
export const FileText = make("edit_note");
export const ChevronRight = make("chevron_right");
export const ChevronLeft = make("chevron_left");
export const ArrowLeft = make("arrow_back");
export const ArrowRight = make("arrow_forward");
export const Star = make("star");
export const Clock = make("schedule");
export const Check = make("check");
export const CheckCircle = make("check_circle");
export const CheckCircle2 = make("check_circle");
export const AlertCircle = make("error");
export const AlertTriangle = make("warning");
export const X = make("close");
export const XCircle = make("cancel");
export const PhoneCall = make("call");
export const MapPin = make("location_on");
export const Flame = make("local_fire_department");
export const Loader2 = make("progress_activity", { spin: true });
export const DollarSign = make("payments");
export const CreditCard = make("credit_card");
export const Activity = make("monitoring");
export const TrendingUp = make("trending_up");
export const Package = make("inventory_2");
export const Share2 = make("share");
export const MessageSquare = make("reviews");
export const Eye = make("visibility");
export const EyeOff = make("visibility_off");
