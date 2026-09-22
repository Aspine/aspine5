import { useLayoutEffect, useRef } from "preact/hooks";

// I swear to god, nobody touch this file.
// Ask Leo to change it if you must, but this took way to long to make,
// just to get broken and overwritten by some stupid change.
// PLS PLS PLS DON'T TOUCH!!!

const SPEED = 2.0;
const SPIN = 1.0;

const W = 192,
	Y = 28,
	R = 10,
	STEP = 0.015;
const CHORD = 2 * R * Math.sin(STEP / 2);

type Pt = { x: number; y: number; s: number };
type Geo = {
	key: string;
	left: number;
	tail: number;
	startX: number;
	center: number;
	x0: number;
	curve: Pt[];
	orbit: number;
	trimStart: number;
	trimEnd: number;
	erase: number[];
	reveal: number[];
};

const smooth = (n: number) => {
	const t = Math.max(0, Math.min(1, n));
	return t * t * (3 - 2 * t);
};

const build = (old: HTMLElement, next: HTMLElement, key: string): Geo => {
	const ow = old.offsetWidth,
		nw = next.offsetWidth;
	const left = (W - nw - 32) / 2,
		tail = (W - ow - 29) / 2;
	const startX = tail + 14,
		center = left + nw + 22;

	let x0 = 0;
	while (x0 + 0.5 <= center - 22) x0 += 0.5;

	const curve: Pt[] = [{ x: x0, y: Y, s: x0 }];
	for (let i = 1; i <= 80; i++) {
		const t = i / 80,
			u = 1 - t,
			p = curve[i - 1]!;
		const x = u ** 3 * x0 + 3 * u * u * t * (x0 + 12) + 3 * u * t * t * (center - 10) + t ** 3 * center;
		const y = u ** 3 * Y + 3 * u * u * t * Y + 3 * u * t * t * 18 + t ** 3 * 18;
		curve.push({ x, y, s: p.s + Math.hypot(x - p.x, y - p.y) });
	}

	const orbit = curve[80]!.s;
	const sAt = (x: number) => (x <= x0 ? Math.ceil(x * 2) / 2 : curve.find(p => p.x >= x)?.s);

	return {
		key,
		left,
		tail,
		startX,
		center,
		x0,
		curve,
		orbit,
		trimStart: sAt(tail + 26) ?? startX,
		trimEnd: sAt(tail + 32 + ow) ?? orbit,
		erase: [...old.children].map(c => (c as HTMLElement).offsetLeft + tail + 29),
		reveal: [...next.children].map(c => {
			const e = (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth;
			return sAt(left + e + 4 + Math.max(0, tail - left) * (1 - e / nw)) ?? orbit;
		})
	};
};

const point = (g: Geo, s: number) => {
	if (s <= g.x0) return { x: s, y: Y };
	if (s >= g.orbit) {
		const k = (s - g.orbit) / CHORD,
			i = Math.floor(k),
			f = k - i;
		const a = -Math.PI / 2 + i * STEP,
			b = a + STEP;
		const ax = g.center + R * Math.cos(a),
			ay = Y + R * Math.sin(a);
		return { x: ax + (g.center + R * Math.cos(b) - ax) * f, y: ay + (Y + R * Math.sin(b) - ay) * f };
	}
	const c = g.curve;
	let lo = 0,
		hi = 80;
	while (lo + 1 < hi) {
		const mid = (lo + hi) >> 1;
		if (c[mid]!.s < s) lo = mid;
		else hi = mid;
	}
	const A = c[lo]!,
		B = c[hi]!,
		t = (s - A.s) / (B.s - A.s);
	return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
};

type Props = { label: string; busyLabel: string; pending: boolean };

export const SignInButton = ({ label, busyLabel, pending }: Props) => {
	const oldLabel = useRef<HTMLSpanElement>(null);
	const newLabel = useRef<HTMLSpanElement>(null);
	const shaftRef = useRef<SVGPathElement>(null);
	const headRef = useRef<SVGPathElement>(null);
	const geo = useRef<Geo | null>(null);

	useLayoutEffect(() => {
		const old = oldLabel.current!,
			next = newLabel.current!;
		const shaft = shaftRef.current!,
			head = headRef.current!;
		const oldChars = [...old.children] as HTMLElement[];
		const newChars = [...next.children] as HTMLElement[];

		const key = `${old.offsetWidth},${next.offsetWidth}`;
		if (geo.current?.key !== key) {
			geo.current = build(old, next, key);
			old.style.left = `${geo.current.tail + 29}px`;
			next.style.left = `${geo.current.left}px`;
		}
		const g = geo.current;

		let width = "",
			opacity = "";
		const show = (el: HTMLElement, on: boolean) => {
			const v = on ? "1" : "0";
			if (el.style.opacity !== v) el.style.opacity = v;
		};

		const draw = (s: number, length: number, progress: number) => {
			const tip = point(g, s),
				ahead = point(g, s + 0.1);
			const angle = Math.atan2(ahead.y - tip.y, ahead.x - tip.x);
			const arm = 7 * (1 - smooth(progress / 0.78));
			const cos = Math.cos(angle),
				sin = Math.sin(angle);

			let d = "";
			for (let i = 0; i <= 80; i++) {
				const p = point(g, s - length + (length * i) / 80);
				d += `${i ? " L" : "M"}${p.x},${p.y}`;
			}
			shaft.setAttribute("d", d);

			head.setAttribute(
				"d",
				`M${tip.x - arm * cos + arm * sin},${tip.y - arm * sin - arm * cos}` +
					`L${tip.x},${tip.y}` +
					`L${tip.x - arm * cos - arm * sin},${tip.y - arm * sin + arm * cos}`
			);

			const w = `${2 * (1 - smooth((progress - 0.78) / 0.22))}`;
			const o = progress >= 1 ? "0" : "1";
			if (w !== width) head.style.strokeWidth = width = w;
			if (o !== opacity) head.style.opacity = opacity = o;
		};

		oldChars.forEach(c => show(c, true));
		newChars.forEach(c => show(c, false));
		draw(g.startX, 14, 0);
		if (!pending) return;

		if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
			oldChars.forEach(c => show(c, false));
			newChars.forEach(c => show(c, true));
			draw(g.orbit + 52, 48, 1);
			return;
		}

		const span = (g.trimEnd - g.trimStart) * 1.2;
		const handoff = Math.max(g.orbit, g.trimStart + span) - g.startX;
		const handoffMs = (handoff / 0.115 + 35) / (1.08 * SPEED);
		const start = performance.now();
		let frame = 0;

		const tick = (now: number) => {
			const elapsed = now - start;
			const ms = elapsed * 1.08 * SPEED;
			const travel =
				elapsed <= handoffMs
					? 0.115 * (ms < 70 ? (ms * ms) / 140 : ms - 35)
					: handoff + (elapsed - handoffMs) * 0.115 * 1.08 * SPIN;
			const s = g.startX + travel;
			const release = Math.max(0, Math.min(20, travel - 24));
			const length = travel <= 24 ? 14 + travel : 38 + release - release ** 2 / 40;
			const progress = Math.max(0, Math.min(1, (s - g.trimStart) / span));
			const x = point(g, s).x;

			oldChars.forEach((c, i) => show(c, !(s >= g.orbit || x + 3 >= g.erase[i]!)));
			newChars.forEach((c, i) => show(c, s - length >= g.reveal[i]!));
			draw(s, length, progress);

			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [pending, label, busyLabel]);

	return (
		<button
			class="button primary signIn"
			type="submit"
			disabled={pending}
			aria-label={pending ? busyLabel : label}
			aria-busy={pending}
		>
			<span class="signInStage">
				<svg
					aria-hidden="true"
					viewBox="0 0 192 56"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path ref={shaftRef} />
					<path ref={headRef} />
				</svg>
				<span ref={oldLabel} aria-hidden="true">
					{[...label].map((c, i) => (
						<span key={i}>{c}</span>
					))}
				</span>
				<span ref={newLabel} aria-hidden="true">
					{[...busyLabel].map((c, i) => (
						<span key={i}>{c}</span>
					))}
				</span>
			</span>
		</button>
	);
};
