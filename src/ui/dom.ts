/** Finds an element the page is built to contain; a missing one is a build mistake, so it throws. */
export function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) {
    throw new Error(`index.html is missing #${id}`);
  }
  return found;
}
