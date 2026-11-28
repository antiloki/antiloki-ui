// the avatar's look and its six motions (mockup of 2026-11-16, flat, no 3D)
export const AVATAR_CSS = `/* the avatar: a flat blob character per agent, a shape, a colour, tiny eyes, one accessory */
.avatar{position:relative;display:block;width:var(--s,40px);height:var(--s,40px);border:0;background:none;padding:0;cursor:pointer}
.avatar svg.face{width:100%;height:100%;overflow:visible}
.avatar .shadow{fill:#000;opacity:.22;transform-box:fill-box;transform-origin:center}
.avatar .body{fill:var(--k);stroke:color-mix(in srgb,var(--k) 62%,#000);stroke-width:1.1;transform-box:fill-box;transform-origin:50% 100%}
.avatar .acc{transform-box:fill-box;transform-origin:50% 100%}
.avatar .e,.avatar .x,.avatar .h2,.avatar .z,.avatar .mo,.avatar .sw{opacity:0;stroke:var(--eye,#15161a);fill:none;stroke-width:1.7;stroke-linecap:round}
.avatar .e{fill:var(--eye,#15161a);stroke:none}
.avatar .aura,.avatar .orb,.avatar .conf,.avatar .zz,.avatar .drop{opacity:0}
.avatar .aura{fill:none;stroke-width:1.6;transform-box:fill-box;transform-origin:center}
.avatar .bubble{position:absolute;right:-4px;top:-4px;width:15px;height:15px;border-radius:50%;background:var(--panel);border:1px solid var(--line);display:grid;place-items:center}
.avatar .bubble svg{width:9px;height:9px}
.avatar[data-s=idle] .e.n{opacity:1;animation:blink 5s infinite}.avatar[data-s=idle] .body,.avatar[data-s=idle] .acc{animation:breathe 4.2s ease-in-out infinite}
.avatar[data-s=work] .e.n{opacity:1}.avatar[data-s=work] .eyes{animation:look 1.5s ease-in-out infinite}.avatar[data-s=work] .body,.avatar[data-s=work] .acc{animation:hustle .62s ease-in-out infinite}.avatar[data-s=work] .shadow{animation:shadowb .62s ease-in-out infinite}
.avatar[data-s=work] .orb{opacity:1;animation:orbit 1.5s linear infinite;transform-origin:24px 26px}.avatar[data-s=work] .orb circle{fill:var(--ac)}
.avatar[data-s=wait] .e.n{opacity:1}.avatar[data-s=wait] .body,.avatar[data-s=wait] .acc{animation:nod 1.8s ease-in-out infinite}.avatar[data-s=wait] .aura{opacity:1;stroke:var(--warn);animation:breath 1.8s ease-out infinite}
.avatar[data-s=error] .x,.avatar[data-s=error] .mo{opacity:1}.avatar[data-s=error] .body,.avatar[data-s=error] .acc{animation:shake .5s ease 2}.avatar[data-s=error] .aura{opacity:.9;stroke:var(--bad)}.avatar[data-s=error] .drop{opacity:1;animation:drop 1.4s ease-in infinite;fill:var(--ac)}
.avatar[data-s=done] .h2,.avatar[data-s=done] .sw{opacity:1}.avatar[data-s=done] .body,.avatar[data-s=done] .acc{animation:jump .8s ease 1}.avatar[data-s=done] .conf{opacity:1}.avatar[data-s=done] .conf circle{animation:conf 1.1s ease-out 1 both}.avatar[data-s=done] .aura{stroke:var(--ok);animation:pop 1s ease-out 1 both}
.avatar[data-s=sleep]{opacity:.62;filter:saturate(.35)}.avatar[data-s=sleep] .z{opacity:1}.avatar[data-s=sleep] .body{transform:scaleY(.9)}.avatar[data-s=sleep] .acc{transform:translateY(2px) rotate(-6deg)}.avatar[data-s=sleep] .zz{opacity:1;animation:zz 3s ease-in-out infinite}
.avatar:hover{filter:brightness(1.12)}
@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.avatar .e{transform-box:fill-box;transform-origin:center}
@keyframes breathe{50%{transform:scale(1.035,.97)}}@keyframes look{0%,100%{transform:translateX(-1.4px)}50%{transform:translateX(1.4px)}}
@keyframes hustle{0%,100%{transform:translateY(0) scale(1.03,.96)}50%{transform:translateY(-4px) scale(.97,1.04)}}@keyframes shadowb{50%{transform:scale(.8);opacity:.12}}
@keyframes orbit{to{transform:rotate(360deg)}}@keyframes nod{0%,100%{transform:translateY(0)}30%{transform:translateY(2.5px) scale(1.02,.97)}60%{transform:translateY(0)}}
@keyframes breath{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}@keyframes shake{20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
@keyframes drop{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(10px);opacity:0}}
@keyframes jump{0%{transform:translateY(0) scale(1.06,.9)}35%{transform:translateY(-9px) scale(.95,1.06)}65%{transform:translateY(0) scale(1.05,.93)}100%{transform:none}}
@keyframes conf{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}@keyframes pop{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}
@keyframes zz{0%{opacity:0;transform:translate(0,0)}40%{opacity:1}100%{opacity:0;transform:translate(5px,-9px)}}
.chars{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end;padding:6px 0 4px}.chars .c{display:grid;gap:6px;justify-items:center;cursor:pointer;border:0;background:none;color:var(--mut);font:inherit;padding:6px 8px;border-radius:12px}.chars .c[aria-pressed=true]{background:var(--raise);color:var(--fg)}.chars .c span{font-size:12.5px}
`;
