/**
 * Draggable + Resizable Overlay Panel — Spec 15 T-5
 *
 * A floating panel wrapper with:
 * - Drag via header bar (cursor: grab)
 * - Resize via bottom-right handle
 * - Position/size persisted in localStorage
 * - Double-click header to reset to defaults
 * - Constrained to viewport bounds
 * - Min 300×200, max viewport
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { GripVertical, Minus } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "marco-overlay-geometry";
const MIN_W = 300;
const MIN_H = 200;

interface Geometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

const DEFAULT_GEOMETRY: Geometry = {
    x: -1,  // -1 = auto (bottom-right)
    y: -1,
    width: 420,
    height: 500,
};

function loadGeometry(): Geometry {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...DEFAULT_GEOMETRY, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_GEOMETRY };
}

function saveGeometry(g: Geometry) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
}

function resolveInitial(g: Geometry): Geometry {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(g.width, MIN_W), vw);
    const height = Math.min(Math.max(g.height, MIN_H), vh);
    const x = g.x < 0 ? vw - width - 16 : Math.min(Math.max(0, g.x), vw - width);
    const y = g.y < 0 ? vh - height - 16 : Math.min(Math.max(0, g.y), vh - height);
    return { x, y, width, height };
}

/* ------------------------------------------------------------------ */
/*  Hook: useDrag                                                      */
/* ------------------------------------------------------------------ */

function useDrag(
    geo: Geometry,
    setGeo: (g: Geometry) => void,
) {
    const dragging = useRef(false);
    const offset = useRef({ dx: 0, dy: 0 });

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging.current = true;
        offset.current = { dx: e.clientX - geo.x, dy: e.clientY - geo.y };

        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const nx = Math.min(Math.max(0, ev.clientX - offset.current.dx), vw - geo.width);
            const ny = Math.min(Math.max(0, ev.clientY - offset.current.dy), vh - geo.height);
            setGeo({ ...geo, x: nx, y: ny });
        };

        const onUp = () => {
            dragging.current = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [geo, setGeo]);

    return onMouseDown;
}

/* ------------------------------------------------------------------ */
/*  Hook: useResize                                                    */
/* ------------------------------------------------------------------ */

function useResize(
    geo: Geometry,
    setGeo: (g: Geometry) => void,
) {
    const resizing = useRef(false);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        resizing.current = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = geo.width;
        const startH = geo.height;

        const onMove = (ev: MouseEvent) => {
            if (!resizing.current) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const nw = Math.min(Math.max(MIN_W, startW + (ev.clientX - startX)), vw - geo.x);
            const nh = Math.min(Math.max(MIN_H, startH + (ev.clientY - startY)), vh - geo.y);
            setGeo({ ...geo, width: nw, height: nh });
        };

        const onUp = () => {
            resizing.current = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [geo, setGeo]);

    return onMouseDown;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface DraggableOverlayProps {
    title?: string;
    children: ReactNode;
    headerExtra?: ReactNode;
    /** Status for the minimized badge: idle | running | error */
    status?: "idle" | "running" | "error";
}

export function DraggableOverlay({ title = "Marco", children, headerExtra, status = "idle" }: DraggableOverlayProps) {
    const [geo, setGeoRaw] = useState<Geometry>(() => resolveInitial(loadGeometry()));
    const [minimized, setMinimized] = useState(false);

    const setGeo = useCallback((g: Geometry) => {
        setGeoRaw(g);
        saveGeometry(g);
    }, []);

    const handleDrag = useDrag(geo, setGeo);
    const handleResize = useResize(geo, setGeo);

    const handleDoubleClick = useCallback(() => {
        const reset = resolveInitial(DEFAULT_GEOMETRY);
        setGeo(reset);
    }, [setGeo]);

    const statusColor = status === "running" ? "bg-primary" : status === "error" ? "bg-destructive" : "bg-success";
    const statusIcon = status === "running" ? "▶" : status === "error" ? "⚠" : "⏹";

    // Constrain on window resize
    useEffect(() => {
        const onResize = () => {
            setGeoRaw(prev => {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const width = Math.min(prev.width, vw);
                const height = Math.min(prev.height, vh);
                const x = Math.min(prev.x, vw - width);
                const y = Math.min(prev.y, vh - height);
                return { x: Math.max(0, x), y: Math.max(0, y), width, height };
            });
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    /* ── Minimized badge ── */
    if (minimized) {
        return (
            <div
                className="fixed z-50 flex items-center justify-center rounded-full border border-border bg-card shadow-xl cursor-pointer hover:scale-110 transition-transform select-none"
                style={{
                    left: geo.x + geo.width - 44,
                    top: geo.y,
                    width: 44,
                    height: 44,
                }}
                onClick={() => setMinimized(false)}
                title="Restore overlay"
            >
                <span className={`h-3 w-3 rounded-full ${statusColor} animate-pulse`} />
                <span className="sr-only">{statusIcon}</span>
            </div>
        );
    }

    /* ── Full overlay ── */
    return (
        <div
            className="fixed z-50 flex flex-col rounded-lg border border-border bg-card shadow-xl overflow-hidden"
            style={{
                left: geo.x,
                top: geo.y,
                width: geo.width,
                height: geo.height,
            }}
        >
            {/* Header — drag handle */}
            <div
                className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border cursor-grab active:cursor-grabbing select-none shrink-0"
                onMouseDown={handleDrag}
                onDoubleClick={handleDoubleClick}
            >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={`h-2 w-2 rounded-full ${statusColor} shrink-0`} />
                <span className="text-xs font-bold tracking-tight flex-1">{title}</span>
                <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setMinimized(true)}
                    title="Minimize to badge"
                >
                    <Minus className="h-3 w-3" />
                </button>
                {headerExtra}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-3">
                {children}
            </div>

            {/* Resize handle */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                onMouseDown={handleResize}
            >
                <svg
                    className="w-3 h-3 text-muted-foreground/50 absolute bottom-0.5 right-0.5"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                >
                    <circle cx="10" cy="10" r="1.5" />
                    <circle cx="6" cy="10" r="1.5" />
                    <circle cx="10" cy="6" r="1.5" />
                    <circle cx="2" cy="10" r="1.5" />
                    <circle cx="10" cy="2" r="1.5" />
                    <circle cx="6" cy="6" r="1.5" />
                </svg>
            </div>
        </div>
    );
}
