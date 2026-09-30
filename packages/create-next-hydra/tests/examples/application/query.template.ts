/*{% echo imports %}*/

export const document = `query Content { content { /*{% echo slots.content.spreads %}*/ } }`;
export const fragments = [/*{% echo slots.content.documents %}*/];
