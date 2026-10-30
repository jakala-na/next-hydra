/*{% echo imports %}*/

export const config = /*{% echo slots.configuration.open %}*/ {
  features: [/*{% echo slots.environment %}*/],
} /*{% echo slots.configuration.close %}*/ satisfies { features: unknown[] };
