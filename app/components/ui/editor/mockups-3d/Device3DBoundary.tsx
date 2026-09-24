"use client";

import { Component, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useGLTF } from "@react-three/drei";

class Boundary extends Component<{ children: ReactNode; modelUrl?: string; fallback: (retry: () => void) => ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? this.props.fallback(() => {
      if (this.props.modelUrl) useGLTF.clear(this.props.modelUrl);
      this.setState({ failed: false });
    }) : this.props.children;
  }
}

export function Device3DBoundary({ children, modelUrl }: { children: ReactNode; modelUrl?: string }) {
  const t = useTranslations("mockupMenu");
  return (
    <Boundary fallback={(retry) => (
      <div role="alert" className="flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center text-sm text-foreground">
        <p>{t("deviceLoadError")}</p>
        <button type="button" onClick={retry} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">{t("retry")}</button>
      </div>
    )} modelUrl={modelUrl}>{children}</Boundary>
  );
}
