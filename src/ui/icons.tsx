const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconPencil = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...svgProps}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    <path d="m15 5 4 4"/>
  </svg>
);

export const IconTrash = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...svgProps}>
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
  </svg>
);

export const IconExternal = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...svgProps}>
    <path d="M15 3h6v6"/>
    <path d="M10 14 21 3"/>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  </svg>
);

export const IconMoveTo = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...svgProps}>
    <path d="m15 14 5-5-5-5"/>
    <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
  </svg>
);

export const IconChevronDown = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...svgProps}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);