"use client";

import React, { useState } from "react";
import { SplineHero } from "./spline-hero";
import { AuthPanel, type AuthPanelView } from "./auth-panel";

export function LandingPageContainer() {
  const [authView, setAuthView] = useState<AuthPanelView>(null);

  return (
    <>
      <SplineHero
        onLoginClick={() => setAuthView("login")}
      />
      <AuthPanel
        view={authView}
        onClose={() => setAuthView(null)}
        onChangeView={setAuthView}
      />
    </>
  );
}
