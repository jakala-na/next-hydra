/*{% echo imports %}*/
export function Layout() {
  return (
    /*{% echo slots.providers.open %}*/
    <main>
      {
        /*{% if enabled.account %}*/
        <header>{/*{{ slots.account }}*/}</header>
        /*{% endif %}*/
      }
      Hello
    </main>
    /*{% echo slots.providers.close %}*/
  );
}
