"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signLease, type SignState } from "./actions";
import { CONSENT_TEXT } from "@/lib/signing";
import { buttonClass } from "@/components/ui";

const INITIAL: SignState = { status: "idle" };

function Sign() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary", "big")} w-full mt-3 disabled:opacity-60`}
    >
      {pending ? "Signing…" : "Sign the agreement"}
    </button>
  );
}

/**
 * Drawing pad. Optional — the typed name is the signature and this is a
 * picture of it — but people expect to be able to sign their name, and a
 * document that only accepts typing feels less like one you are signing.
 */
function DrawPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    // The canvas is 2x its CSS size for sharpness on a phone.
    return {
      x: (event.clientX - box.left) * (canvas.width / box.width),
      y: (event.clientY - box.top) * (canvas.height / box.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d")!;
    context.strokeStyle = "#0b0b0b";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
    drawing.current = true;
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current!.getContext("2d")!;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setDirty(true);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    onChange(null);
  };

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-ink-2">
          Draw your signature <span className="font-normal text-ink-3">— optional</span>
        </span>
        {dirty && (
          <button type="button" onClick={clear} className="text-[12px] text-ink-3 underline underline-offset-2">
            clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-[100px] border-[1.5px] border-hairline rounded-[11px] bg-white touch-none cursor-crosshair"
      />
    </div>
  );
}

export function SignPanel({
  leaseId,
  partyLabel,
  otherSigned,
}: {
  leaseId: string;
  partyLabel: string;
  otherSigned: boolean;
}) {
  const [result, action] = useActionState(signLease, INITIAL);
  const [mark, setMark] = useState<string | null>(null);

  if (result.status === "signed") {
    return (
      <p className="text-[13.5px] text-good-text bg-brand-wash border border-brand-wash-2 rounded-[10px] px-3.5 py-3">
        ✓ Signed. {otherSigned
          ? "Both parties have now signed — Yardtize checks it and the placement goes live."
          : "We'll let you know when the other party signs."}
      </p>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="leaseId" value={leaseId} />
      <input type="hidden" name="drawnMark" value={mark ?? ""} />

      <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="typedName">
        Your full name, signing as {partyLabel.toLowerCase()}
      </label>
      <input
        id="typedName"
        name="typedName"
        required
        autoComplete="name"
        placeholder="Andrew Brain"
        className="w-full border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-2.5 text-[16px] focus:outline-none focus:border-brand-mid"
      />

      <DrawPad onChange={setMark} />

      <label className="flex gap-2.5 items-start mt-3.5 cursor-pointer">
        <input
          type="checkbox"
          name="consented"
          required
          className="mt-[3px] w-[16px] h-[16px] accent-[#166534] shrink-0"
        />
        <span className="text-[12.5px] text-ink-2">{CONSENT_TEXT}</span>
      </label>

      {result.status === "error" && (
        <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-3">
          {result.message}
        </p>
      )}

      <Sign />
    </form>
  );
}
