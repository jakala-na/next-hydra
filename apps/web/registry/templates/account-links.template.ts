/*{% echo imports %}*/

type AccountLinks = { accountHref?: string; signUpHref?: string };
export function accountLinks(): AccountLinks {
  const result: AccountLinks = {};
  for (const links of [/*{% echo slots.links %}*/]) {
    Object.assign(result, links);
  }
  return result;
}
