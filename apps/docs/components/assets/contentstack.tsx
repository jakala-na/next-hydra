export const Contentstack = (props: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    aria-label="Contentstack"
    role="img"
    {...props}
    style={{
      WebkitMaskImage: "url('/contentstack-logo.webp')",
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      backgroundColor: "currentColor",
      display: "inline-block",
      height: "1em",
      maskImage: "url('/contentstack-logo.webp')",
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      width: "1em",
      ...props.style,
    }}
  />
);
