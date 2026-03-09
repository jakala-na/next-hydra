export const Contentstack = (
  props: React.HTMLAttributes<HTMLSpanElement>
) => (
  <span
    aria-label="Contentstack"
    role="img"
    {...props}
    style={{
      display: "inline-block",
      width: "1em",
      height: "1em",
      backgroundColor: "currentColor",
      maskImage: "url('/contentstack-logo.webp')",
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskImage: "url('/contentstack-logo.webp')",
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      ...(props.style ?? {}),
    }}
  />
);
