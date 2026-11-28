// A PAGE IN A FRAME OF ITS OWN (found on the operator's video team, 2026-11-15: "the preview did not work on click"): a page shown through `srcDoc` takes the address of the app around it, so a link to a part of the same page (`#s1`, the contents list of a result page)
// would send the frame to the APP's address and the page would vanish. Pin the page's own address first, and scroll to a part ourselves when a link to one is clicked. Pure.
const FIX = `<base href="about:srcdoc"><script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;e.preventDefault();var id=decodeURIComponent(a.getAttribute("href").slice(1));var t=id&&document.getElementById(id);if(t)t.scrollIntoView({behavior:"smooth"});else window.scrollTo(0,0)});</script>`;
export function frameDoc(html: string, base = ""): string {
  // a result page points at the serve's media route through a placeholder (it does not carry a video inside itself): the address of THIS serve goes in when the page is shown
  if (base && html.includes("__ANTILOKI_BASE__")) html = html.split("__ANTILOKI_BASE__").join(base);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${FIX}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${FIX}</head>`);
  return `${FIX}${html}`;
}
