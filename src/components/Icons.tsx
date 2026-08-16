/**
 * iOS版で使っている SF Symbols に対応するアイコン。
 * 端末ごとに字形が変わる絵文字ではなく、どのブラウザでも同じ形になる SVG で描く。
 */
interface IconProps {
  className?: string;
}

const base = {
  viewBox: "0 0 24 24",
  width: 17,
  height: 17,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** hand.raised.fill 相当。つかむ。 */
export function HandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.5 11V5.5a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M11.3 10.6V4.6a1.4 1.4 0 0 1 2.8 0v6" />
      <path d="M14.1 11V6.4a1.4 1.4 0 0 1 2.8 0V14" />
      <path d="M8.5 11V9.2a1.4 1.4 0 0 0-2.8 0v4.4c0 3.5 2.4 6.4 6 6.4s5.2-2.4 5.2-6" />
    </svg>
  );
}

/** hand.raised.slash.fill 相当。離す。 */
export function HandSlashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.5 11V5.5a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M11.3 10.6V4.6a1.4 1.4 0 0 1 2.8 0v6" />
      <path d="M14.1 11V6.4a1.4 1.4 0 0 1 2.8 0V14" />
      <path d="M8.5 11V9.2a1.4 1.4 0 0 0-2.8 0v4.4c0 3.5 2.4 6.4 6 6.4s5.2-2.4 5.2-6" />
      <path d="M4 20 20 4" />
    </svg>
  );
}

/** doc.on.doc 相当。コピー。 */
export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15.5 6.2A2.2 2.2 0 0 0 13.4 4.5H6.2A2.2 2.2 0 0 0 4 6.7v7.2c0 1 .7 1.9 1.7 2.1" />
    </svg>
  );
}

/** doc.on.clipboard 相当。貼り付け。 */
export function PasteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="5.5" width="14" height="15" rx="2.4" />
      <path d="M9 5.5V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6v.9z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

/** exclamationmark.arrow.triangle.2.circlepath 相当。全解除。 */
export function ReleaseAllIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M17.7 2.9v3.5h-3.5M6.3 21.1v-3.5h3.5" />
      <path d="M12 9v3.4M12 15.4v.1" />
    </svg>
  );
}

/** paperplane.fill 相当。送信。 */
export function SendIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.5 3.5 3.9 10.2c-.8.3-.8 1.4 0 1.7l6.4 2.3 2.3 6.4c.3.8 1.4.8 1.7 0z" />
      <path d="M10.4 14.1 20.5 3.5" />
    </svg>
  );
}

/** return 相当。エンター。 */
export function ReturnIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 5v6.5a3 3 0 0 1-3 3H5" />
      <path d="M8.5 11 5 14.5 8.5 18" />
    </svg>
  );
}

/** delete.left 相当。1文字消す。 */
export function BackspaceIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9.2 5h9.3A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5H9.2a2 2 0 0 1-1.5-.7L3 12l4.7-6.3a2 2 0 0 1 1.5-.7z" />
      <path d="M11.5 9.5 17 14.5M17 9.5l-5.5 5" />
    </svg>
  );
}

/** gearshape.fill 相当。設定。 */
export function GearIcon({ className }: IconProps) {
  return (
    <svg {...base} width={14} height={14} className={className}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.6M12 18.8v2.6M4.4 4.4l1.9 1.9M17.7 17.7l1.9 1.9M2.6 12h2.6M18.8 12h2.6M4.4 19.6l1.9-1.9M17.7 6.3l1.9-1.9" />
    </svg>
  );
}

/** hand.draw.fill / hand.point.up.left.fill 相当。操作エリアの見出し。 */
export function TouchIcon({ className }: IconProps) {
  return (
    <svg {...base} width={24} height={24} strokeWidth={1.7} className={className}>
      <path d="M10 11.5V5a1.5 1.5 0 0 1 3 0v6.2" />
      <path d="M13 11V9.4a1.5 1.5 0 0 1 3 0V12" />
      <path d="M16 12v-.6a1.5 1.5 0 0 1 3 0V15c0 3.3-2.2 6-5.6 6-3 0-4.5-1.4-5.7-3.4l-2.4-4a1.4 1.4 0 0 1 2.3-1.6L10 14" />
    </svg>
  );
}
