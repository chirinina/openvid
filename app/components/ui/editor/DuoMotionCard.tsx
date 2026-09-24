"use client";

import Image from "next/image";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";

export function DuoMotionCard() {
  const t = useTranslations("motionMenu");
  const device = useMockup3dContext();
  const active = device.imagePhoneActive && device.imagePhoneDevice === "iphone-duo";

  function addDuo() {
    device.setImagePhoneDevice("iphone-duo");
    device.setImagePhoneActive(true);
    device.setImagePhoneX(0);
    device.setImagePhoneY(0);
    device.setImagePhoneScale(0.7);
    device.setImagePhoneRotX(6);
    device.setImagePhoneRotY(-12);
    device.setImagePhoneRotZ(0);
    device.setImagePhoneOpening(1);
    device.setImagePhonePresetId("custom");
    device.setViewer3DAutoRotate(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-36 overflow-hidden bg-[#101116]">
        <Image width={800} height={480} src="/images/mockups-3d/iphone-duo/preview.webp" alt="iPhone Duo" className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[9px] font-medium uppercase tracking-widest text-white/80">3D · iPhone Duo</span>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="text-xs font-medium text-foreground">{t("duoEyebrow")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t(active ? "duoHint" : "duoDescription")}</p>
        </div>
        {active ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon icon="lucide:check" width={13} />{t("duoActive")}</div>
        ) : (
          <button type="button" onClick={addDuo} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <Icon icon="lucide:plus" width={14} />{t("duoAdd")}
          </button>
        )}
      </div>
    </div>
  );
}
