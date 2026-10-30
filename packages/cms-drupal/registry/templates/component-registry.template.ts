/*{% echo imports %}*/

export const componentMap = {/*{% echo slots.blocks %}*/} as const;

export const componentFragments = Object.values(componentMap).map(
  (component) => component.fragment
);
