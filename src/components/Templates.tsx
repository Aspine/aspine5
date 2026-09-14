import { Check, ChevronDown, X } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { REPO_URL, SNACKBAR_MS } from "@/config";
import type { ApiState } from "@/lib/useApi";

export type Column = {
	label: ComponentChildren;
	numeric?: boolean;
	icon?: boolean;
};

export type MenuItem = {
	label: string;
	detail: string;
	checked: boolean;
	onSelect?: () => void;
};

export type Snack = {
	id: number;
	text: string;
	action?: readonly [string, () => void];
};

const cellClass = (column: Column | undefined) =>
	column?.numeric ? "numeric" : column?.icon ? "iconCell" : undefined;

export const Table = ({
	columns,
	rows,
	children
}: {
	columns: readonly Column[];
	rows?: readonly (readonly ComponentChildren[])[];
	children?: ComponentChildren;
}) =>
	rows?.length === 0 ? (
		<p class="muted">None</p>
	) : (
		<div class="tableScroll">
			<table class="table">
				<thead>
					<tr>
						{columns.map((column, index) => (
							<th key={index} class={cellClass(column)}>
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows?.map((cells, rowIndex) => (
						<tr key={rowIndex}>
							{cells.map((cell, cellIndex) => (
								<td
									key={cellIndex}
									class={cellClass(columns[cellIndex])}
								>
									{cell}
								</td>
							))}
						</tr>
					))}
					{children}
				</tbody>
			</table>
		</div>
	);

export const Status = ({ error }: { error: string | null }) => (
	<p class={error ? "status error" : "status"}>{error ?? "Loading"}</p>
);

export const Loaded = <T,>({
	state,
	children
}: {
	state: ApiState<T>;
	children: (data: T) => ComponentChildren;
}) =>
	state.data === null ? (
		<Status error={state.error} />
	) : (
		<>{children(state.data)}</>
	);

export const Toggle = <T extends string>({
	options,
	value,
	variant,
	label = option => option,
	onChange
}: {
	options: readonly T[];
	value: T;
	variant: "tab" | "button";
	label?: (option: T) => ComponentChildren;
	onChange: (value: T) => void;
}) => (
	<>
		{options.map(option => (
			<button
				key={option}
				type="button"
				class={variant}
				aria-pressed={option === value}
				onClick={() => onChange(option)}
			>
				{label(option)}
			</button>
		))}
	</>
);

export const Menu = ({
	label,
	groups
}: {
	label: ComponentChildren;
	groups: readonly (readonly MenuItem[])[];
}) => {
	const [position, setPosition] = useState<{
		top: number;
		right: number;
	} | null>(null);
	const button = useRef<HTMLButtonElement>(null);
	const popover = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!position) return;
		const close = () => setPosition(null);
		const closeOutside = (event: PointerEvent) => {
			const target = event.target as Node;
			if (
				!popover.current?.contains(target) &&
				!button.current?.contains(target)
			)
				close();
		};
		const closeOnEscape = (event: KeyboardEvent) =>
			event.key === "Escape" && close();
		addEventListener("pointerdown", closeOutside);
		addEventListener("keydown", closeOnEscape);
		addEventListener("resize", close);
		return () => {
			removeEventListener("pointerdown", closeOutside);
			removeEventListener("keydown", closeOnEscape);
			removeEventListener("resize", close);
		};
	}, [position]);

	const toggle = () => {
		const rect = button.current?.getBoundingClientRect();
		setPosition(
			position || !rect
				? null
				: { top: rect.bottom + 6, right: innerWidth - rect.right }
		);
	};

	return (
		<>
			<button
				ref={button}
				type="button"
				class="menuButton"
				aria-haspopup="menu"
				aria-expanded={position !== null}
				disabled={groups.length === 0}
				onClick={toggle}
			>
				{label}
				<ChevronDown size={14} aria-hidden="true" />
			</button>
			{position && (
				<div
					ref={popover}
					class="menu"
					role="menu"
					style={{
						top: `${position.top}px`,
						right: `${position.right}px`
					}}
				>
					{groups.map((group, index) => (
						<div key={index} class="menuGroup">
							{group.map(item =>
								item.onSelect ? (
									<button
										key={item.label}
										type="button"
										role="menuitemradio"
										aria-checked={item.checked}
										class="menuItem"
										onClick={() => {
											item.onSelect?.();
											setPosition(null);
										}}
									>
										<span>{item.label}</span>
										<span class="menuDetail">
											{item.detail}
										</span>
										{item.checked ? (
											<Check
												size={14}
												aria-hidden="true"
											/>
										) : (
											<span />
										)}
									</button>
								) : (
									<div
										key={item.label}
										class="menuItem static"
									>
										<span>{item.label}</span>
										<span class="menuDetail">
											{item.detail}
										</span>
										<span />
									</div>
								)
							)}
						</div>
					))}
				</div>
			)}
		</>
	);
};

export const Modal = ({
	title,
	onClose,
	children
}: {
	title: string;
	onClose: () => void;
	children: ComponentChildren;
}) => {
	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) =>
			event.key === "Escape" && onClose();
		addEventListener("keydown", closeOnEscape);
		return () => removeEventListener("keydown", closeOnEscape);
	}, [onClose]);

	return (
		<div
			class="modalBackdrop"
			onClick={event => event.target === event.currentTarget && onClose()}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div class="modalHeader">
					<h2>{title}</h2>
					<button
						type="button"
						class="iconButton"
						aria-label="Close"
						onClick={onClose}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
};

export const Snackbar = ({
	snack,
	onClose
}: {
	snack: Snack | null;
	onClose: () => void;
}) => {
	useEffect(() => {
		if (!snack) return;
		const timer = setTimeout(onClose, SNACKBAR_MS);
		return () => clearTimeout(timer);
	}, [snack]);

	return snack ? (
		<div key={snack.id} class="snackbar" role="status">
			<span>{snack.text}</span>
			{snack.action && (
				<button
					type="button"
					class="snackAction"
					onClick={() => {
						snack.action?.[1]();
						onClose();
					}}
				>
					{snack.action[0]}
				</button>
			)}
			<button
				type="button"
				class="iconButton"
				aria-label="Close"
				onClick={onClose}
			>
				<X size={16} aria-hidden="true" />
			</button>
		</div>
	) : null;
};

export const Footer = ({
	commit,
	stage = false,
	children
}: {
	commit: string | null;
	stage?: boolean;
	children?: ComponentChildren;
}) => (
	<footer class={stage ? "pageBottom stageFooter" : "pageBottom"}>
		{commit ? (
			<a
				href={`${REPO_URL}/commit/${commit}`}
				target="_blank"
				rel="noreferrer"
			>
				#{commit.slice(0, 7)}
			</a>
		) : (
			<span />
		)}
		<nav class="footerLinks" aria-label="Links">
			{children}
			<a href={`${REPO_URL}/issues/new`} target="_blank" rel="noreferrer">
				Report issue
			</a>
			<a href={REPO_URL} target="_blank" rel="noreferrer">
				{REPO_URL.replace("https://", "")}
			</a>
		</nav>
	</footer>
);
